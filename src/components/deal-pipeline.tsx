import Link from "next/link";
import * as C from "@/lib/constants";
import { Badge, fmtDate } from "./ui";
import { moveDealAction } from "@/server/actions";
import { LOST_REASONS } from "@/server/live";

import { columnsFor, type Deal, type Stage } from "@/lib/pipeline";
export type { Deal, Stage };

const money = (v?: string | null) => { if (!v) return null; const n = Number(v); return n >= 1e6 ? `AED ${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `AED ${Math.round(n / 1e3)}K` : `AED ${Math.round(n)}`; };

/** One deal: its pipeline as columns from first stage to Won / Lost. Click a column to move the deal there. */
export function DealPipeline({ deal, stages, back, showProject = false }: { deal: Deal; stages: Stage[]; back: string; showProject?: boolean }) {
  const { cols, current } = columnsFor(deal, stages);
  const isLost = cols[current]?.lost, isWon = cols[current]?.won;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="deal">
      <div className="deal-h">
        <div>
          <Link className="deal-title" href={`/opportunities/${deal.id}`}>{showProject && deal.project ? deal.project : deal.title}</Link>
          <div className="deal-meta">
            {deal.venture ? <Badge tone="outline">{deal.venture}</Badge> : <span className="faint">No venture</span>}
            {money(deal.estimated_value) ? <span className="num">{money(deal.estimated_value)}</span> : <span className="faint">No value yet</span>}
            {deal.next_action ? <span>Next: {deal.next_action}{deal.follow_up_date ? <span style={deal.follow_up_date < today && !isWon && !isLost ? { color: "var(--bad)" } : undefined}> · {fmtDate(deal.follow_up_date)}</span> : null}</span> : null}
            {showProject && deal.project_id ? <Link className="link" href={`/pipeline?project=${deal.project_id}`}>All deals on this project</Link> : null}
          </div>
        </div>
        <Link className="btn sm" href={`/meetings/new?opportunityId=${deal.id}${deal.project_id ? `&projectId=${deal.project_id}` : ""}&title=${encodeURIComponent(`Meeting — ${deal.project ?? deal.title}`)}&back=${encodeURIComponent(back)}`}>Plan meeting</Link>
      </div>
      <div className="strip" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
        {cols.map((c, i) => {
          const state = i === current ? "current" : !isLost && i < current && !c.lost ? "done" : "todo";
          const cls = `stg ${state}${c.won ? " won" : ""}${c.lost ? " lost" : ""}`;
          const body = <><span className="n">{c.won ? "✓" : c.lost ? "✕" : String(i + 1).padStart(2, "0")}</span><span className="l">{c.label}</span>{i === current ? <span className="here">{c.lost && deal.lost_reason ? deal.lost_reason : "Here"}</span> : null}</>;
          if (i === current) return <div key={c.key} className={cls}>{body}</div>;
          if (c.lost) return (
            <details key={c.key} className={cls}><summary>{body}</summary>
              <form action={moveDealAction.bind(null, deal.id, c.target)} className="stg-pop">
                <input type="hidden" name="_back" value={back} /><input type="hidden" name="_lost" value="1" />
                <select name="reason" required defaultValue=""><option value="" disabled>Why was it lost?</option>{LOST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}</select>
                <input name="reasonNote" placeholder="Detail (optional)" />
                <button className="btn danger sm" type="submit">Mark as lost</button>
              </form></details>);
          return <form key={c.key} action={moveDealAction.bind(null, deal.id, c.target)} className="stg-form"><input type="hidden" name="_back" value={back} /><button type="submit" className={cls} title={`Move to ${c.label}`}>{body}</button></form>;
        })}
      </div>
    </div>
  );
}

export const STATUS_LABEL = (v: string) => C.label(C.COMMERCIAL_STATUS, v);
