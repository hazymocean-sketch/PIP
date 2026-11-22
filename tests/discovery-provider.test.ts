import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/server/ai/providers", async (orig) => {
  const real = await orig<typeof import("@/server/ai/providers")>();
  return {
    ...real,
    getSearchProvider: () => ({
      id: "fake", label: "Fake Search",
      search: async (q: string) => [
        { title: `Riyadh luxury hotel announced (${q})`, url: `https://www.example-news.com/a?q=${encodeURIComponent(q)}`, snippet: "A 300-key hotel…", publishedAt: "Sat, 22 Nov 2026 10:00:00 GMT" },
        { title: "Same article again", url: "https://example-news.com/shared/", snippet: "dup", publishedAt: "2026-11-21T08:00:00Z" },
        { title: "No date result", url: "https://another.example.org/x", snippet: null as unknown as string, publishedAt: "not a date" },
      ],
    }),
  };
});

describe("discovery with a live-style provider", () => {
  it("saves results with provider date formats, derives sources, skips duplicates", async () => {
    const { runDiscovery } = await import("@/server/research");
    const { db } = await import("@/db");
    const S = await import("@/db/schema");
    const r = await runDiscovery({ title: "Riyadh test", query: "new hotels Riyadh", sectorId: null, location: "Saudi Arabia", dateFrom: null, dateTo: null, template: "custom" });
    expect(r.errors).toEqual([]);
    expect(r.created).toBe(3);
    const rows = await db.select().from(S.discoveries).where(eq(S.discoveries.researchSessionId, r.session.id));
    const dated = rows.find((x) => x.title.startsWith("Riyadh luxury"))!;
    expect(dated.publishedAt).toBe("2026-11-22");
    expect(dated.sourceName).toBe("example-news.com");
    expect(rows.find((x) => x.title === "No date result")!.publishedAt).toBeNull();
    const again = await runDiscovery({ title: "Riyadh test 2", query: "new hotels Riyadh", sectorId: null, location: "Saudi Arabia", dateFrom: null, dateTo: null, template: "custom" });
    expect(again.created).toBe(0);
    expect(again.skipped).toBe(3);
  });
});
