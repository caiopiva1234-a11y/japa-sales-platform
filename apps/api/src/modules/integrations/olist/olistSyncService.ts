import axios from "axios";
import { prisma } from "../../../shared/prisma.js";
import {
  INTEGRATION_SETTING_KEYS,
  readDecryptedIntegrationSetting
} from "../integrationCredentials.js";
import { encryptSecret } from "../../../shared/crypto.js";
import { normalizeOlistBaseUrl } from "./olistUrl.js";

type OlistOrder = {
  id: string;
  customer: { id: string; name: string; phone?: string };
  total: number;
  status: string;
  created_at: string;
  items: Array<{ sku: string; name: string; quantity: number; unit_price: number }>;
};

type RemoteOrder = {
  id?: string;
  customer?: { id?: string; name?: string; phone?: string };
  client?: { id?: string; name?: string; phone?: string };
  contact?: { id?: string; name?: string; phone?: string };
  buyer?: { id?: string; name?: string; phone?: string };
  customer_id?: string;
  client_id?: string;
  contact_id?: string;
  total?: number;
  total_value?: number;
  value?: number;
  status?: string;
  created_at?: string;
  createdAt?: string;
  date?: string;
  items?: Array<{
    sku?: string;
    name?: string;
    quantity?: number;
    qty?: number;
    unit_price?: number;
    price?: number;
  }>;
  line_items?: RemoteOrder["items"];
};

export type OlistSyncParams = {
  baseUrl: string;
  apiToken: string;
  cutoff: Date;
  until?: Date | null;
};

export type OlistSyncResult = {
  message: string;
  totalReceived: number;
  rawListCount: number;
  parsedOrders: number;
  syncedOrders: number;
  skippedOrders: string[];
  skippedMissingCustomer: string[];
  skippedOutOfRangeOrders: string[];
  skippedInvalidDateOrders: string[];
  syncWindow: { cutoffIso: string; untilIso: string | null; months: number | null };
  remote: {
    httpStatus: number;
    topLevelKeys: string[];
    chosenOrdersPath: string | null;
    rawType: string;
  };
};

async function upsertIntegrationSetting(key: string, value: string) {
  await prisma.integrationSetting.upsert({
    where: { key },
    update: { valueEncrypted: encryptSecret(value) },
    create: { key, valueEncrypted: encryptSecret(value) }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractOrdersArray(payload: unknown): { orders: RemoteOrder[]; path: string | null } {
  if (Array.isArray(payload)) {
    return { orders: payload as RemoteOrder[], path: "<root-array>" };
  }

  if (!isRecord(payload)) {
    return { orders: [], path: null };
  }

  const candidates: Array<[string, unknown]> = [
    ["orders", payload.orders],
    ["data.orders", isRecord(payload.data) ? (payload.data as Record<string, unknown>).orders : undefined],
    ["data", (payload as Record<string, unknown>).data],
    ["items", payload.items],
    ["results", payload.results],
    ["pedidos", (payload as Record<string, unknown>).pedidos]
  ];

  for (const [path, value] of candidates) {
    if (Array.isArray(value)) {
      return { orders: value as RemoteOrder[], path };
    }
  }

  // Some APIs nest lists under `data` as an array
  if (Array.isArray((payload as Record<string, unknown>).data)) {
    return { orders: (payload as { data: RemoteOrder[] }).data, path: "data" };
  }

  return { orders: [], path: null };
}

function normalizeRemoteOrder(raw: RemoteOrder): OlistOrder | null {
  const id = raw.id;
  const customerId =
    raw.customer?.id ??
    raw.client?.id ??
    raw.contact?.id ??
    raw.buyer?.id ??
    raw.customer_id ??
    raw.client_id ??
    raw.contact_id;
  const customerName =
    raw.customer?.name ?? raw.client?.name ?? raw.contact?.name ?? raw.buyer?.name ?? "Cliente";
  const customerPhone = raw.customer?.phone ?? raw.client?.phone ?? raw.contact?.phone ?? raw.buyer?.phone;
  if (!id || !customerId) return null;

  const createdRaw = raw.created_at ?? raw.createdAt ?? raw.date;
  if (!createdRaw) return null;

  const totalRaw = raw.total ?? raw.total_value ?? raw.value;
  const total = typeof totalRaw === "number" && !Number.isNaN(totalRaw) ? totalRaw : 0;

  const status = raw.status ?? "imported";

  const rawItems = raw.items ?? raw.line_items ?? [];
  const items = (Array.isArray(rawItems) ? rawItems : [])
    .map((item) => {
      const sku = item.sku ?? "SEM_SKU";
      const name = item.name ?? sku;
      const quantity = item.quantity ?? item.qty ?? 0;
      const unitPrice = item.unit_price ?? item.price ?? 0;
      if (!sku || !Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return null;
      return { sku, name, quantity, unit_price: unitPrice };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const finalItems =
    items.length > 0
      ? items
      : [
          {
            sku: "SEM_ITENS",
            name: "Pedido importado sem itens detalhados",
            quantity: 0,
            unit_price: 0
          }
        ];

  return {
    id,
    customer: { id: customerId, name: customerName, phone: customerPhone },
    total,
    status,
    created_at: createdRaw,
    items: finalItems
  };
}

export async function runOlistOrderSync(params: OlistSyncParams): Promise<OlistSyncResult> {
  const normalizedBase = normalizeOlistBaseUrl(params.baseUrl);
  if (!normalizedBase.ok) {
    throw new Error(`OLIST URL invalida: ${normalizedBase.message}`);
  }

  const response = await axios.get<unknown>(`${normalizedBase.baseUrl}/orders`, {
    headers: { Authorization: `Bearer ${params.apiToken}` },
    timeout: 120000
  });

  const topLevelKeys = isRecord(response.data) ? Object.keys(response.data).slice(0, 40) : [];
  const extracted = extractOrdersArray(response.data);
  const rawListCount = extracted.orders.length;
  const normalizedOrders = extracted.orders
    .map((row) => normalizeRemoteOrder(row))
    .filter((row): row is OlistOrder => Boolean(row));

  let syncedOrders = 0;
  const skipped: string[] = [];
  const skippedMissingCustomer: string[] = [];
  const skippedOutOfRange: string[] = [];
  const skippedInvalidDate: string[] = [];

  const until = params.until ?? null;

  for (const remoteOrder of normalizedOrders) {
    if (!remoteOrder.id || !remoteOrder.customer?.id) {
      skippedMissingCustomer.push(remoteOrder.id ?? "sem-id");
      continue;
    }

    const orderDate = new Date(remoteOrder.created_at);
    if (Number.isNaN(orderDate.getTime())) {
      skippedInvalidDate.push(remoteOrder.id);
      continue;
    }

    if (orderDate < params.cutoff) {
      skippedOutOfRange.push(remoteOrder.id);
      continue;
    }

    if (until && orderDate > until) {
      skippedOutOfRange.push(remoteOrder.id);
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        const customer = await tx.customer.upsert({
          where: { externalId: remoteOrder.customer.id },
          update: {
            name: remoteOrder.customer.name,
            phone: remoteOrder.customer.phone
          },
          create: {
            externalId: remoteOrder.customer.id,
            name: remoteOrder.customer.name,
            phone: remoteOrder.customer.phone
          }
        });

        const order = await tx.order.upsert({
          where: { externalId: remoteOrder.id },
          update: {
            totalValue: remoteOrder.total,
            status: remoteOrder.status,
            orderDate: new Date(remoteOrder.created_at),
            customerId: customer.id
          },
          create: {
            externalId: remoteOrder.id,
            customerId: customer.id,
            totalValue: remoteOrder.total,
            status: remoteOrder.status,
            orderDate: new Date(remoteOrder.created_at)
          }
        });

        for (const item of remoteOrder.items) {
          const product = await tx.product.upsert({
            where: { sku: item.sku },
            update: { name: item.name },
            create: { sku: item.sku, name: item.name }
          });

          await tx.orderItem.upsert({
            where: { orderId_productId: { orderId: order.id, productId: product.id } },
            update: {
              quantity: item.quantity,
              unitPrice: item.unit_price,
              totalPrice: item.quantity * item.unit_price
            },
            create: {
              orderId: order.id,
              productId: product.id,
              quantity: item.quantity,
              unitPrice: item.unit_price,
              totalPrice: item.quantity * item.unit_price
            }
          });
        }
      });
      syncedOrders += 1;
    } catch {
      skipped.push(remoteOrder.id);
    }
  }

  const nowIso = new Date().toISOString();
  await upsertIntegrationSetting(INTEGRATION_SETTING_KEYS.olistLastSuccessfulFetchAt, nowIso);
  await upsertIntegrationSetting(INTEGRATION_SETTING_KEYS.olistLastSyncAt, nowIso);

  return {
    message: "Sincronizacao OLIST concluida.",
    // `totalReceived` kept as "lista bruta" count for compatibilidade com UI antiga
    totalReceived: rawListCount,
    rawListCount,
    parsedOrders: normalizedOrders.length,
    syncedOrders,
    skippedOrders: skipped,
    skippedMissingCustomer,
    skippedOutOfRangeOrders: skippedOutOfRange,
    skippedInvalidDateOrders: skippedInvalidDate,
    syncWindow: {
      cutoffIso: params.cutoff.toISOString(),
      untilIso: until ? until.toISOString() : null,
      months: null
    },
    remote: {
      httpStatus: response.status,
      topLevelKeys,
      chosenOrdersPath: extracted.path,
      rawType: Array.isArray(response.data) ? "array" : typeof response.data
    }
  };
}

export async function readNumberSetting(key: string, fallback: number) {
  const raw = await readDecryptedIntegrationSetting(key);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export async function assertOlistRemoteCallAllowed() {
  const minMinutes = await readNumberSetting(INTEGRATION_SETTING_KEYS.olistMinManualIntervalMinutes, 10);
  const lastRaw = await readDecryptedIntegrationSetting(INTEGRATION_SETTING_KEYS.olistLastSuccessfulFetchAt);
  if (!lastRaw) return { ok: true as const, retryAfterSeconds: 0 };

  const last = new Date(lastRaw);
  if (Number.isNaN(last.getTime())) return { ok: true as const, retryAfterSeconds: 0 };

  const elapsedMs = Date.now() - last.getTime();
  const minMs = minMinutes * 60_000;
  if (elapsedMs >= minMs) return { ok: true as const, retryAfterSeconds: 0 };

  const retryAfterSeconds = Math.max(1, Math.ceil((minMs - elapsedMs) / 1000));
  return { ok: false as const, retryAfterSeconds, minMinutes };
}
