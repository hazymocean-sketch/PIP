/**
 * Modular AI and search provider layer.
 *
 * Nothing here is hard-wired to one vendor. Providers are selected from
 * server-side env vars. When no key is configured the provider is reported as
 * "not connected" and callers fall back to the manual / rule-based path — the
 * app never pretends an automated call happened.
 *
 * STATUS: the Tavily, Brave and Anthropic adapters below are written to their
 * public HTTP APIs but have NOT been tested against live keys yet.
 */

export type SearchResult = { title: string; url: string; snippet?: string; publishedAt?: string | null; sourceName?: string | null };

export interface SearchProvider {
  id: string;
  label: string;
  search(query: string, opts?: { maxResults?: number; days?: number }): Promise<SearchResult[]>;
}

export interface AIProvider {
  id: string;
  label: string;
  complete(system: string, prompt: string, opts?: { maxTokens?: number }): Promise<string>;
}

export type IntegrationStatus = { key: string; label: string; category: "search" | "ai" | "email" | "social" | "calendar" | "crm"; connected: boolean; tested: boolean; note: string };

class TavilySearch implements SearchProvider {
  id = "tavily"; label = "Tavily Search";
  constructor(private key: string) {}
  async search(query: string, opts: { maxResults?: number; days?: number } = {}) {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.key}` },
      body: JSON.stringify({ query, max_results: opts.maxResults ?? 10, topic: "news", days: opts.days ?? 30 }),
    });
    if (!res.ok) throw new Error(`Tavily error ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const data = (await res.json()) as { results?: { title: string; url: string; content?: string; published_date?: string }[] };
    return (data.results ?? []).map((r) => ({ title: r.title, url: r.url, snippet: r.content, publishedAt: r.published_date ?? null }));
  }
}

class BraveSearch implements SearchProvider {
  id = "brave"; label = "Brave Search";
  constructor(private key: string) {}
  async search(query: string, opts: { maxResults?: number } = {}) {
    const u = new URL("https://api.search.brave.com/res/v1/news/search");
    u.searchParams.set("q", query); u.searchParams.set("count", String(opts.maxResults ?? 10));
    const res = await fetch(u, { headers: { "X-Subscription-Token": this.key, accept: "application/json" } });
    if (!res.ok) throw new Error(`Brave error ${res.status}`);
    const data = (await res.json()) as { results?: { title: string; url: string; description?: string; age?: string; meta_url?: { hostname?: string } }[] };
    return (data.results ?? []).map((r) => ({ title: r.title, url: r.url, snippet: r.description, sourceName: r.meta_url?.hostname ?? null }));
  }
}

class AnthropicAI implements AIProvider {
  id = "anthropic"; label = "Anthropic Claude";
  constructor(private key: string, private model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5") {}
  async complete(system: string, prompt: string, opts: { maxTokens?: number } = {}) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": this.key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: this.model, max_tokens: opts.maxTokens ?? 1500, system, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    return (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
  }
}

/** Local testing only: deterministic fake results with a delay. Never active in production. */
class FakeSearch implements SearchProvider {
  id = "fake"; label = "Test search";
  async search(query: string) {
    await new Promise((r) => setTimeout(r, 900));
    const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return [1, 2, 3].map((n) => ({ title: `Test result ${n} for ${query}`, url: `https://test.example.com/${slug}/${n}`, snippet: "Fake result for local testing.", publishedAt: "Sat, 22 Nov 2026 10:00:00 GMT" }));
  }
}

export function getSearchProvider(): SearchProvider | null {
  const p = (process.env.SEARCH_PROVIDER || "").toLowerCase();
  if (p === "fake" && process.env.NODE_ENV !== "production" && process.env.ALLOW_FAKE_SEARCH === "1") return new FakeSearch();
  if (p === "fake" && process.env.ALLOW_FAKE_SEARCH === "1" && process.env.PIP_LOCAL_TEST === "1") return new FakeSearch();
  if (p === "tavily" && process.env.TAVILY_API_KEY) return new TavilySearch(process.env.TAVILY_API_KEY);
  if (p === "brave" && process.env.BRAVE_SEARCH_API_KEY) return new BraveSearch(process.env.BRAVE_SEARCH_API_KEY);
  return null;
}

export function getAIProvider(): AIProvider | null {
  const p = (process.env.AI_PROVIDER || "").toLowerCase();
  if (p === "anthropic" && process.env.ANTHROPIC_API_KEY) return new AnthropicAI(process.env.ANTHROPIC_API_KEY);
  return null;
}

/** Integration status for Settings and the Command Centre. Never exposes key values. */
export function integrationStatus(): IntegrationStatus[] {
  const search = getSearchProvider();
  const ai = getAIProvider();
  return [
    { key: "search", label: search?.label ?? "Web / news search", category: "search", connected: !!search, tested: false,
      note: search ? "Key present. Adapter not yet verified against live API." : "Not connected — set SEARCH_PROVIDER + key. Discovery runs in manual mode." },
    { key: "ai", label: ai?.label ?? "AI model", category: "ai", connected: !!ai, tested: false,
      note: ai ? "Key present. Adapter not yet verified against live API." : "Not connected — agents use the transparent rule-based planner." },
    { key: "email", label: "Email sending", category: "email", connected: false, tested: false, note: "Not built yet. Outreach drafts are created; sending is simulated after approval." },
    { key: "social", label: "LinkedIn / social", category: "social", connected: false, tested: false, note: "Not built yet. Publishing actions are simulated." },
    { key: "calendar", label: "Calendar", category: "calendar", connected: false, tested: false, note: "Not built yet." },
    { key: "calibro_crm", label: "Calibro CRM bridge", category: "crm", connected: false, tested: false, note: "Deferred by design. Future optional, approved-records-only API sync." },
  ];
}
