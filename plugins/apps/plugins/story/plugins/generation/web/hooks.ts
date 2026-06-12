import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { storyGeneratedUnitsResource } from "../shared/resources";
import { generateUnit } from "../shared/endpoints";
import type { GenStatus } from "../core";

// A generation request is a *turn*: the renderer assembles the full prompt
// (format + context). `instruction` records the human directive for history.
export type GenerationTurn = {
  inputHash: string;
  prompt: string;
  instruction?: string;
};

export type UnitState = {
  status: GenStatus | "none";
  output: string | null;
  error: string | null;
  isStale: boolean;
  instruction: string | null;
};

export type GenerationOverall = "none" | "partial" | "generating" | "ready" | "error";

export type UseGeneratedUnitsResult = {
  /** True while the resource is still loading — distinct from "genuinely empty". */
  pending: boolean;
  byUnit: Map<string, UnitState>;
  overall: GenerationOverall;
  generate: (unitId: string, turn: GenerationTurn) => Promise<void>;
};

const NONE_STATE: UnitState = {
  status: "none",
  output: null,
  error: null,
  isStale: false,
  instruction: null,
};

// Derive a single overall state from the per-unit statuses. error > generating
// dominate; all ready → ready; none present → none; otherwise partial.
function deriveOverall(states: UnitState[]): GenerationOverall {
  if (states.length === 0) return "none";
  if (states.some((s) => s.status === "error")) return "error";
  if (states.some((s) => s.status === "generating")) return "generating";
  if (states.every((s) => s.status === "none")) return "none";
  if (states.every((s) => s.status === "ready")) return "ready";
  return "partial";
}

export function useGeneratedUnits({
  pageId,
  kind,
  units,
}: {
  pageId: string;
  kind: string;
  units: { unitId: string; currentHash: string }[];
}): UseGeneratedUnitsResult {
  const result = useResource(storyGeneratedUnitsResource);
  const mutation = useEndpointMutation(generateUnit);

  const generate = async (unitId: string, turn: GenerationTurn): Promise<void> => {
    await mutation.mutateAsync({
      params: { pageId, kind, unitId },
      body: {
        prompt: turn.prompt,
        inputHash: turn.inputHash,
        instruction: turn.instruction,
      },
    });
  };

  // Gate on loading rather than collapsing it into a fake empty state, so the
  // consumer can tell "still loading" from "genuinely nothing generated".
  if (result.pending) {
    return { pending: true, byUnit: new Map(), overall: "none", generate };
  }
  const rows = result.data;

  const byUnit = new Map<string, UnitState>();
  for (const u of units) {
    const row = rows.find(
      (r) => r.pageId === pageId && r.kind === kind && r.unitId === u.unitId,
    );
    if (!row) {
      byUnit.set(u.unitId, NONE_STATE);
      continue;
    }
    byUnit.set(u.unitId, {
      status: row.status,
      output: row.output,
      error: row.error,
      isStale: row.status === "ready" && row.inputHash !== u.currentHash,
      instruction: row.instruction,
    });
  }

  const overall = deriveOverall([...byUnit.values()]);

  return { pending: false, byUnit, overall, generate };
}
