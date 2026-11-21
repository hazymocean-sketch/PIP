/** Small, strict FormData readers used by server actions. */
import { isHttpUrl } from "./normalize";
import type { Option } from "./constants";

export class ValidationError extends Error {}

const MAX = 20000;

export function str(fd: FormData, key: string, opts: { required?: boolean; max?: number } = {}): string | null {
  const v = fd.get(key);
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) {
    if (opts.required) throw new ValidationError(`${key} is required`);
    return null;
  }
  if (s.length > (opts.max ?? MAX)) throw new ValidationError(`${key} is too long`);
  return s;
}

export function reqStr(fd: FormData, key: string, max?: number): string {
  return str(fd, key, { required: true, max }) as string;
}

export function url(fd: FormData, key: string, required = false): string | null {
  const s = str(fd, key, { required, max: 2048 });
  if (!s) return null;
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  if (!isHttpUrl(withProto)) throw new ValidationError(`${key} must be a valid URL`);
  return withProto;
}

export function email(fd: FormData, key: string): string | null {
  const s = str(fd, key, { max: 320 });
  if (!s) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new ValidationError(`${key} must be a valid email`);
  return s.toLowerCase();
}

export function int(fd: FormData, key: string, min = -2147483648, max = 2147483647): number | null {
  const s = str(fd, key);
  if (s === null) return null;
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isInteger(n) || n < min || n > max) throw new ValidationError(`${key} must be a whole number`);
  return n;
}

export function money(fd: FormData, key: string): string | null {
  const s = str(fd, key);
  if (s === null) return null;
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) throw new ValidationError(`${key} must be a positive number`);
  return n.toFixed(2);
}

export function dateStr(fd: FormData, key: string): string | null {
  const s = str(fd, key);
  if (s === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(s))) throw new ValidationError(`${key} must be a date`);
  return s;
}

export function uuidOrNull(fd: FormData, key: string): string | null {
  const s = str(fd, key);
  if (s === null) return null;
  if (!/^[0-9a-f-]{36}$/i.test(s)) throw new ValidationError(`${key} is invalid`);
  return s;
}

export function oneOf(fd: FormData, key: string, opts: Option[], fallback?: string): string {
  const s = str(fd, key);
  if (s === null) {
    if (fallback !== undefined) return fallback;
    throw new ValidationError(`${key} is required`);
  }
  if (!opts.some((o) => o.value === s)) throw new ValidationError(`${key} has an invalid value`);
  return s;
}

export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

export function uuids(fd: FormData, key: string): string[] {
  return fd.getAll(key).filter((v): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v));
}
