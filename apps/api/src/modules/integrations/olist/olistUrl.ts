/** Lista de pedidos na API v3 do ERP Olist/Tiny (OpenAPI oficial: GET /pedidos). */
export const OLIST_TINY_V3_ORDERS_LIST_PATH = "/pedidos";

const TINY_ERP_API_HOSTS = new Set(["api.tiny.com.br", "erp.tiny.com.br"]);
const TINY_V3_PREFIX = "/public-api/v3";

/**
 * Se o usuario colar so o host da Tiny (`https://api.tiny.com.br`), o GET vira
 * `/pedidos` na raiz e a Tiny responde 404. A API REST v3 fica em `/public-api/v3`.
 */
function withTinyV3PrefixIfNeeded(url: URL): string {
  const host = url.hostname.toLowerCase();
  if (!TINY_ERP_API_HOSTS.has(host)) {
    return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
  }

  let path = url.pathname.replace(/\/$/, "");
  if (path === "/") path = "";

  const pathLower = path.toLowerCase();
  if (pathLower.startsWith(`${TINY_V3_PREFIX}/`) || pathLower === TINY_V3_PREFIX) {
    return `${url.origin}${path}`;
  }

  if (path === "") {
    return `${url.origin}${TINY_V3_PREFIX}`;
  }

  return `${url.origin}${path}`;
}

export function normalizeOlistBaseUrl(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false as const, message: "URL vazia." };

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { ok: false as const, message: "URL precisa comecar com http:// ou https://." };
    }

    const normalized = withTinyV3PrefixIfNeeded(url);
    return { ok: true as const, baseUrl: normalized };
  } catch {
    return {
      ok: false as const,
      message:
        "URL invalida. Para Tiny API v3 use por exemplo: https://api.tiny.com.br/public-api/v3 (sem espacos)."
    };
  }
}
