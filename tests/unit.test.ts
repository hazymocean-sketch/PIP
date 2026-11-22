import { describe, expect, it } from "vitest";
import { normalizeName, normalizeUrl } from "@/lib/normalize";
import { computeScore } from "@/lib/scoring";
import { evaluate, nextScheduledRun } from "@/server/workflows/engine";
import { requiresApproval } from "@/server/agents/policy";
import { TOOLS } from "@/server/agents/tools";

describe("normalisation", () => {
  it("normalises names for duplicate detection", () => {
    expect(normalizeName("The Ritz-Carlton, Ras Al Khaimah")).toBe("ritz carlton ras al khaimah");
    expect(normalizeName("Café & Bar LLC")).toBe("cafe and bar");
  });
  it("normalises URLs (www, tracking params, trailing slash)", () => {
    expect(normalizeUrl("https://www.Example.com/news/a/?utm_source=x&id=2")).toBe("example.com/news/a?id=2");
    expect(normalizeUrl("example.com/news/a")).toBe("example.com/news/a");
  });
});

describe("scoring", () => {
  it("weights and normalises to 0–100", () => {
    const f = [{ key: "a", label: "A", weight: 3 }, { key: "b", label: "B", weight: 1 }];
    expect(computeScore(f, { a: 5, b: 5 }).score).toBe(100);
    expect(computeScore(f, { a: 5, b: 0 }).score).toBe(75);
    expect(computeScore(f, {}).ratedCount).toBe(0);
  });
});

describe("workflow conditions & schedules", () => {
  it("evaluates conditions", () => {
    expect(evaluate({ field: "priority", op: "in", value: ["high", "urgent"] }, { priority: "high" })).toBe(true);
    expect(evaluate({ field: "x", op: "exists", value: null }, {})).toBe(false);
    expect(evaluate({ field: "n", op: "gte", value: 3 }, { n: 4 })).toBe(true);
  });
  it("computes next run times", () => {
    const from = new Date("2026-11-23T03:00:00Z"); // 07:00 Dubai, Monday
    expect(nextScheduledRun({ every: "day", at: "08:00" }, from)!.toISOString()).toBe("2026-11-23T04:00:00.000Z");
    expect(nextScheduledRun({ every: "day", at: "06:30" }, from)!.toISOString()).toBe("2026-11-24T02:30:00.000Z");
    expect(nextScheduledRun({ every: "week", weekday: 1, at: "10:00" }, from)!.toISOString()).toBe("2026-11-23T06:00:00.000Z");
  });
});

describe("approval policy", () => {
  it("assist mode gates every consequential tool", () => {
    expect(requiresApproval(TOOLS.create_task, "assist", 0, 0)).toBe(true);
    expect(requiresApproval(TOOLS.search_records, "assist", 0, 0)).toBe(false);
  });
  it("automate mode allows internal, gates external", () => {
    expect(requiresApproval(TOOLS.create_task, "automate", 0, 0)).toBe(false);
    expect(requiresApproval(TOOLS.send_email, "automate", 0, 0)).toBe(true);
  });
  it("autonomous mode respects explicit limits", () => {
    expect(requiresApproval(TOOLS.send_email, "autonomous", 0, 0)).toBe(true);
    expect(requiresApproval(TOOLS.send_email, "autonomous", 0, 2)).toBe(false);
    expect(requiresApproval(TOOLS.send_email, "autonomous", 2, 2)).toBe(true);
  });
});

import { resolveDatabaseUrl } from "@/db";
describe("database url", () => {
  const base = "postgresql://postgres.abc:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres";
  it("inserts and encodes a separate password", () => {
    expect(resolveDatabaseUrl(base, "p@ss#w/rd?")).toBe("postgresql://postgres.abc:p%40ss%23w%2Frd%3F@aws-0-eu-central-1.pooler.supabase.com:5432/postgres");
  });
  it("replaces an existing password and trims whitespace", () => {
    expect(resolveDatabaseUrl(" postgresql://postgres.abc:old@h:5432/postgres ", "New1")).toBe("postgresql://postgres.abc:New1@h:5432/postgres");
  });
  it("explains a leftover placeholder", () => {
    expect(() => resolveDatabaseUrl(base, undefined)).toThrow(/DATABASE_PASSWORD/);
  });
});
describe("supabase placeholder variants", () => {
  it("handles [YOUR-DATABASE-PASSWORD]", () => {
    expect(resolveDatabaseUrl("postgresql://postgres.x:[YOUR-DATABASE-PASSWORD]@h.pooler.supabase.com:5432/postgres", "a@b")).toBe("postgresql://postgres.x:a%40b@h.pooler.supabase.com:5432/postgres");
  });
});
