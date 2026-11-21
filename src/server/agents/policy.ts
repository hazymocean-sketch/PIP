/**
 * Human-approval policy. Single source of truth for when an agent may act.
 *
 *  assist      → may read and analyse; every consequential tool needs approval.
 *  automate    → may perform consequential INTERNAL actions (tasks, notes, routing);
 *                anything external needs approval.
 *  autonomous  → internal actions allowed; external actions allowed only up to the
 *                agent's explicit autonomy_limit per run, after which approval is needed.
 */
import type { ToolDef } from "./tools";

export type Mode = "assist" | "automate" | "autonomous";

export function requiresApproval(tool: ToolDef, mode: Mode, externalActionsSoFar: number, autonomyLimit: number): boolean {
  if (!tool.consequential) return false;
  if (mode === "assist") return true;
  if (tool.kind === "internal") return false;
  if (mode === "automate") return true;
  return externalActionsSoFar >= autonomyLimit;
}

export function riskFor(tool: ToolDef): "low" | "medium" | "high" {
  if (tool.kind === "external" && tool.consequential) return "high";
  if (tool.consequential) return "medium";
  return "low";
}
