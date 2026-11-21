/** Transparent opportunity scoring: each factor rated 0–5, weighted, normalised to 0–100. */
export type Factor = { key: string; label: string; weight: number; description?: string | null };

export function computeScore(factors: Factor[], ratings: Record<string, number>) {
  let total = 0, max = 0;
  const rows = factors.map((f) => {
    const r = Math.max(0, Math.min(5, Number(ratings[f.key] ?? 0)));
    const rated = ratings[f.key] !== undefined && ratings[f.key] !== null;
    total += r * f.weight;
    max += 5 * f.weight;
    return { ...f, rating: r, rated, contribution: r * f.weight };
  });
  const score = max > 0 ? Math.round((total / max) * 100) : 0;
  const ratedCount = rows.filter((r) => r.rated).length;
  return { score, rows, ratedCount, complete: ratedCount === factors.length };
}

export function scoreBand(score: number | null | undefined) {
  if (score === null || score === undefined) return { label: "Not scored", tone: "muted" as const };
  if (score >= 70) return { label: "High", tone: "good" as const };
  if (score >= 45) return { label: "Medium", tone: "warn" as const };
  return { label: "Low", tone: "muted" as const };
}
