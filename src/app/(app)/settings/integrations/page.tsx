import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { integrationStatus } from "@/server/ai/providers";
import { Badge, Card } from "@/components/ui";

export default async function Integrations() {
  const list = integrationStatus();
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "integration_check"));
  const check = (row?.value ?? {}) as Record<string, { ok: boolean; detail: string; at: string }>;
  return (<div className="stack">
    <Card title="Integrations" sub="Keys are read from server environment variables only. They are never shown here or sent to the browser." tight>
      <div className="list">{list.map((i) => <div key={i.key} className="li"><div className="grow"><div className="ttl">{i.label}</div><div className="meta">{i.note}</div></div>{check[i.key] ? <span className="row" style={{ gap: 6 }}><Badge tone={check[i.key].ok ? "good" : i.connected ? "bad" : "outline"}>{check[i.key].ok ? "Live ✓" : i.connected ? "Check failed" : "Not connected"}</Badge></span> : <Badge tone={i.connected ? "warn" : "outline"}>{i.connected ? "Key present · untested" : "Not connected"}</Badge>}</div>)}</div>
      {Object.keys(check).length ? <div className="card-b" style={{ borderTop: "1px solid var(--glass-line)" }}><div className="lbl-s" style={{ marginBottom: 8 }}>Last live check (runs on every deploy)</div>{Object.entries(check).map(([k, v]) => <div key={k} className="small" style={{ marginBottom: 4 }}><span style={{ color: v.ok ? "var(--good)" : "var(--bad)" }}>{v.ok ? "✓" : "✗"}</span> <b>{k}</b> — {v.detail} <span className="faint">({new Date(v.at).toLocaleString("en-GB", { timeZone: "Asia/Dubai" })})</span></div>)}</div> : null}
    </Card>
    <Card title="How to connect">
      <ol className="small" style={{ margin: 0, paddingLeft: 18, color: "var(--text-2)" }}>
        <li>Create an account with the provider (e.g. Tavily or Brave for search; Anthropic for AI).</li>
        <li>In your hosting dashboard (Vercel → Project → Settings → Environment Variables), add e.g. <code>SEARCH_PROVIDER=tavily</code> and <code>TAVILY_API_KEY</code>, or <code>AI_PROVIDER=anthropic</code> and <code>ANTHROPIC_API_KEY</code>. Locally, put them in <code>.env</code>.</li>
        <li>Redeploy. This page will show the key as present; PIP marks it “untested” until a verified run succeeds.</li>
        <li>Never paste keys into chat, code or the PIP interface.</li>
      </ol>
    </Card>
  </div>);
}
