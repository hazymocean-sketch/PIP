import { integrationStatus } from "@/server/ai/providers";
import { Badge, Card } from "@/components/ui";

export default function Integrations() {
  const list = integrationStatus();
  return (<div className="stack">
    <Card title="Integrations" sub="Keys are read from server environment variables only. They are never shown here or sent to the browser." tight>
      <div className="list">{list.map((i) => <div key={i.key} className="li"><div className="grow"><div className="ttl">{i.label}</div><div className="meta">{i.note}</div></div><Badge tone={i.connected ? (i.tested ? "good" : "warn") : "outline"}>{i.connected ? (i.tested ? "Connected" : "Key present · untested") : "Not connected"}</Badge></div>)}</div>
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
