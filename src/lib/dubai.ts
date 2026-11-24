/** Date helpers in Dubai time (UTC+4, no daylight saving). Dates are "YYYY-MM-DD" strings. */
export const DUBAI_OFFSET_MS = 4 * 3600_000;
export const isoDay = (s: string | undefined | null) => (s && /^\d{4}-\d\d-\d\d$/.test(s) && !isNaN(Date.parse(s)) ? s : null);
export const todayDubai = () => new Date(Date.now() + DUBAI_OFFSET_MS).toISOString().slice(0, 10);
export const dayOf = (d: Date) => new Date(d.getTime() + DUBAI_OFFSET_MS).toISOString().slice(0, 10);
export const timeOf = (d: Date) => new Date(d.getTime() + DUBAI_OFFSET_MS).toISOString().slice(11, 16);
export const hourOf = (d: Date) => Number(timeOf(d).slice(0, 2));
export const addDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const addMonths = (d: string, n: number) => { const x = new Date(`${d.slice(0, 7)}-01T00:00:00Z`); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };
/** Monday of the week containing d. */
export const weekStart = (d: string) => { const dow = (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7; return addDays(d, -dow); };
export const startUtc = (d: string) => new Date(`${d}T00:00:00+04:00`);
export const label = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", ...opts });
