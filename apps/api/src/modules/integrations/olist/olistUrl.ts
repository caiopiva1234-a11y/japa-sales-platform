export function normalizeOlistBaseUrl(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false as const, message: "URL vazia." };

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { ok: false as const, message: "URL precisa comecar com http:// ou https://." };
    }

    // Remove trailing slash for composicao consistente com "/orders"
    const normalized = `${url.origin}${url.pathname.replace(/\/$/, "")}`;
    return { ok: true as const, baseUrl: normalized };
  } catch {
    return {
      ok: false as const,
      message:
        "URL invalida. Use uma URL absoluta, por exemplo: https://api.seudominio.com (sem espacos e com esquema)."
    };
  }
}
