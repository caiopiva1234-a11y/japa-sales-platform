import axios from "axios";
import { prisma } from "../../../shared/prisma.js";
import {
  INTEGRATION_SETTING_KEYS,
  readDecryptedIntegrationSetting
} from "../integrationCredentials.js";
import { encryptSecret } from "../../../shared/crypto.js";

type OlistOrder = {
  id: string;
  customer: { id: string; name: string; phone?: string };
  total: number;
  status: string;
  created_at: string;
  items: Array<{ sku: string; name: string; quantity: number; unit_price: number }>;
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
  syncedOrders: number;
  skippedOrders: string[];
  skippedOutOfRangeOrders: string[];
  skippedInvalidDateOrders: string[];
  syncWindow: { cutoffIso: string; untilIso: string | null; months: number | null };
};

async function upsertIntegrationSetting(key: string, value: string) {
  await prisma.integrationSetting.upsert({
    where: { key },
    update: { valueEncrypted: encryptSecret(value) },
    create: { key, valueEncrypted: encryptSecret(value) }
  });
}

export async function runOlistOrderSync(params: OlistSyncParams): Promise<OlistSyncResult> {
  const response = await axios.get<{ orders: OlistOrder[] }>(`${params.baseUrl}/orders`, {
    headers: { Authorization: `Bearer ${params.apiToken}` },
    timeout: 120000
  });

  const normalizedOrders = response.data.orders ?? [];

  let syncedOrders = 0;
  const skipped: string[] = [];
  const skippedOutOfRange: string[] = [];
  const skippedInvalidDate: string[] = [];

  const until = params.until ?? null;

  for (const remoteOrder of normalizedOrders) {
    if (!remoteOrder.id || !remoteOrder.customer?.id) {
      skipped.push(remoteOrder.id ?? "sem-id");
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
    totalReceived: normalizedOrders.length,
    syncedOrders,
    skippedOrders: skipped,
    skippedOutOfRangeOrders: skippedOutOfRange,
    skippedInvalidDateOrders: skippedInvalidDate,
    syncWindow: {
      cutoffIso: params.cutoff.toISOString(),
      untilIso: until ? until.toISOString() : null,
      months: null
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
