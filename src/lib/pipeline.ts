/** Pipeline columns for a deal: the venture's stages, or a simple status track. */
export type Stage = { id: string; ventureId: string; name: string; sortOrder: number; isClosed: boolean; isWon: boolean };
export type Deal = { id: string; title: string; venture_id: string | null; venture?: string | null; stage_id: string | null; commercial_status: string; lost_reason?: string | null; estimated_value?: string | null; next_action?: string | null; follow_up_date?: string | null; project_id?: string | null; project?: string | null; is_demo?: boolean };

export type Col = { key: string; target: string; label: string; won?: boolean; lost?: boolean };

/** The columns a deal moves through: the venture's stages, or a simple status track if it has no venture. */
export function columnsFor(deal: Deal, stages: Stage[]): { cols: Col[]; current: number } {
  const vs = stages.filter((s) => s.ventureId === deal.venture_id).sort((a, b) => a.sortOrder - b.sortOrder);
  if (vs.length) {
    const open = vs.filter((s) => !s.isClosed), won = vs.filter((s) => s.isWon), lost = vs.filter((s) => s.isClosed && !s.isWon);
    const cols: Col[] = [...open.map((s) => ({ key: s.id, target: `stage:${s.id}`, label: s.name })), ...won.map((s) => ({ key: s.id, target: `stage:${s.id}`, label: s.name, won: true })), ...lost.map((s) => ({ key: s.id, target: `stage:${s.id}`, label: s.name, lost: true }))];
    let current = cols.findIndex((c) => c.key === deal.stage_id);
    if (deal.commercial_status === "won") current = cols.findIndex((c) => c.won);
    if (deal.commercial_status === "lost") current = cols.findIndex((c) => c.lost);
    return { cols, current };
  }
  const cols: Col[] = [["open", "Open"], ["proposal", "Proposal / quotation"], ["negotiation", "Negotiation"], ["won", "Won"], ["lost", "Lost"]].map(([v, l]) => ({ key: v, target: `status:${v}`, label: l, won: v === "won", lost: v === "lost" }));
  return { cols, current: Math.max(0, cols.findIndex((c) => c.key === deal.commercial_status)) };
}

