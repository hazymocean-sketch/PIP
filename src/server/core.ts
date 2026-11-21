/** Shared server utilities: event outbox, notifications, audit log, safe delete. */
import { eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { auditLog, events, notifications } from "@/db/schema";

export async function emitEvent(type: string, entityType: string | null, entityId: string | null, payload: Record<string, unknown> = {}) {
  const [e] = await db.insert(events).values({ type, entityType, entityId, payload }).returning();
  // Process immediately (best-effort). Anything missed is picked up by the cron tick.
  try {
    const { processEvents } = await import("./workflows/engine");
    await processEvents();
  } catch (err) {
    console.error("event processing failed", err);
  }
  return e;
}

export async function notify(title: string, body?: string | null, level: "info" | "warning" | "critical" | "success" = "info", link?: string | null) {
  const [n] = await db.insert(notifications).values({ title, body: body ?? null, level, link: link ?? null }).returning();
  return n;
}

export async function audit(action: string, entityType: string, entityId: string | null, summary?: string, snapshot?: unknown) {
  await db.insert(auditLog).values({ action, entityType, entityId, summary, snapshot: snapshot as object });
}

/** Delete with a JSON snapshot in the audit log so records can be recovered. */
export async function safeDelete(table: PgTable & { id: any }, entityType: string, id: string) {
  const [row] = await db.select().from(table as any).where(eq((table as any).id, id));
  if (!row) return false;
  await audit("delete", entityType, id, (row as any).name ?? (row as any).title ?? (row as any).fullName ?? (row as any).subject ?? null, row);
  await db.delete(table as any).where(eq((table as any).id, id));
  return true;
}

export function addDays(days: number, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Minimal {{path.to.value}} templating for workflow/agent text. */
export function renderTemplate(tpl: string, ctx: Record<string, unknown>) {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
    const v = path.split(".").reduce<any>((acc, k) => (acc == null ? acc : acc[k]), ctx);
    return v == null ? "" : String(v);
  });
}
