/** Normalisation helpers used for duplicate detection. Pure functions — unit tested. */

export function normalizeName(input: string): string {
  return input
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9؀-ۿ]+/g, " ")
    .replace(/\b(the|by|at|llc|l l c|fze|pjsc)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const TRACKING = /^(utm_|fbclid$|gclid$|mc_|ref$|ref_src$|cmpid$)/i;

export function normalizeUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = u.hostname.toLowerCase().replace(/^www\.|^m\.|^amp\./, "");
    const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => a.localeCompare(b));
    const qs = params.length ? "?" + params.map(([k, v]) => `${k}=${v}`).join("&") : "";
    const path = u.pathname.replace(/\/amp\/?$/, "/").replace(/\/+$/, "") || "";
    return `${host}${path}${qs}`;
  } catch {
    return raw.toLowerCase();
  }
}

export function isHttpUrl(s: string): boolean {
  try { const u = new URL(s); return u.protocol === "http:" || u.protocol === "https:"; } catch { return false; }
}

export function slugify(s: string) {
  return normalizeName(s).replace(/\s+/g, "-");
}

/** Any date-ish string (ISO, RFC 2822 "Sat, 22 Nov 2026 10:00:00 GMT", "2026-11-22T…") → "YYYY-MM-DD" or null. */
export function toIsoDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  if (y < 1990 || y > 2100) return null;
  return d.toISOString().slice(0, 10);
}

/** Readable source name from a URL: "www.hoteliermiddleeast.com/x" → "hoteliermiddleeast.com". */
export function sourceFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
}
