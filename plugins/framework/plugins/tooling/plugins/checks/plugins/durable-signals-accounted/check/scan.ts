import {
  TESTS_DIR,
  TESTING_FOLDER,
} from "@plugins/framework/plugins/plugin-id/core";
import {
  findMarkerCalls,
  lineAt,
  parseStringField,
} from "@plugins/plugin-meta/plugins/parse-utils/core";

// The pure half of durable-signals-accounted: find every durable-sink
// declaration in a set of sources, and fold the resolved call sites into the
// sink-id map the check classifies. No git, no fs — the check feeds it sources
// from listCandidateSources and resolves `const` ids itself — so every rule
// here (which calls count, what a computed id means, when an exemption is
// stale, when two primitives claim one id) is unit-testable on literal strings.

/**
 * The two ways a durable sink comes into existence. `defineLogSink` is the
 * server's log channel (a registry entry + a file sink); `defineFileSink` is
 * the bare bounded file, the only form a CLI process can use. Both write a file
 * that outlives the process, so both must be accounted.
 */
export const SINK_MARKERS = ["defineLogSink", "defineFileSink"] as const;
export type SinkMarker = (typeof SINK_MARKERS)[number];

/**
 * Where declarations are looked for. Tests are excluded: a test's sink is a
 * throwaway under a tmp dir with a generated id (`id: uniqueId()`), never a
 * durable signal anyone reads.
 */
export const SINK_PATHSPECS = [
  "*.ts",
  "*.tsx",
  ":(exclude)*.test.ts",
  ":(exclude)*.test.tsx",
  `:(exclude)**/${TESTS_DIR}/**`,
  `:(exclude)**/${TESTING_FOLDER}/**`,
];

/**
 * A call site whose id is computed ON PURPOSE, with the reason its ids are
 * already accounted elsewhere. Matched by marker + file; it must keep matching
 * at least one computed-id call, or the check fails (a stale exemption is an
 * unreviewed hole waiting for the next computed id in that file).
 */
export interface ComputedIdExemption {
  marker: SinkMarker;
  path: string;
  reason: string;
}

export const COMPUTED_ID_EXEMPTIONS: readonly ComputedIdExemption[] = [
  {
    marker: "defineFileSink",
    path: "plugins/primitives/plugins/log-channels/server/internal/log.ts",
    reason:
      "defineLogSink's own body builds its file sink with `id: spec.id`. Those ids are exactly the defineLogSink call sites, which are scanned and accounted by their literal ids.",
  },
];

/** How a call's `id` field reads before const resolution. */
export type RawSinkId =
  | { kind: "literal"; value: string }
  /** A bare identifier (`id: DURESS_EPISODES_CHANNEL`) — resolvable to its `export const`. */
  | { kind: "const"; name: string }
  /** Anything else: a member access, a call, a template, a shorthand, or no `id` at all. */
  | { kind: "computed"; expr: string | null };

export interface RawSinkCall {
  marker: SinkMarker;
  path: string;
  line: number;
  id: RawSinkId;
}

export interface ResolvedSinkCall {
  marker: SinkMarker;
  path: string;
  line: number;
  /** Null when the id is computed, or a const with no live declaration. */
  id: string | null;
}

export interface CallSite {
  marker: SinkMarker;
  path: string;
  line: number;
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/**
 * Every declaration of `marker` in `sources`. Detection is AST-shaped, not
 * line-based: `findMarkerCalls` full-masks (a call written in a comment or a
 * string never matches) and slices the args from the original, so the `id`
 * field reads back intact whatever the call's line layout.
 */
export function scanSinkCalls(
  sources: ReadonlyArray<{ rel: string; src: string }>,
  marker: SinkMarker,
): RawSinkCall[] {
  const calls: RawSinkCall[] = [];
  for (const { rel, src } of sources) {
    for (const call of findMarkerCalls(src, marker)) {
      // Skip the primitive's OWN definition (`export function defineFileSink(spec:
      // FileSinkSpec)`): a real declaration passes an inline object literal, so
      // its args begin with `{`; a signature's begin with a parameter name.
      if (!/^\s*\{/.test(call.argsText)) continue;
      const res = parseStringField(call.argsText, "id");
      const id: RawSinkId =
        res.kind === "value"
          ? { kind: "literal", value: res.value }
          : res.kind === "dynamic" && IDENTIFIER.test(res.expr.trim())
            ? { kind: "const", name: res.expr.trim() }
            : {
                kind: "computed",
                expr: res.kind === "dynamic" ? res.expr : null,
              };
      calls.push({ marker, path: rel, line: lineAt(src, call.index), id });
    }
  }
  return calls;
}

export interface SinkInventory {
  /** Sink id → its first call site. */
  found: Map<string, CallSite>;
  /** Computed / unresolvable ids NOT covered by an exemption. */
  unresolvable: CallSite[];
  /** Exemptions that no longer match any computed-id call. */
  staleExemptions: ComputedIdExemption[];
  /** One id declared through BOTH primitives. */
  collisions: Array<{ id: string; sites: CallSite[] }>;
}

/**
 * Fold resolved call sites into the sink-id map. The same id declared twice
 * through ONE primitive keeps its first site (the runtime registry is what
 * rejects a real duplicate); the same id through BOTH primitives is a collision
 * — two different files claiming one accounting entry — and is reported.
 */
export function inventorySinks(
  calls: readonly ResolvedSinkCall[],
  exemptions: readonly ComputedIdExemption[],
): SinkInventory {
  const found = new Map<string, CallSite>();
  const byMarker = new Map<string, Map<SinkMarker, CallSite>>();
  const unresolvable: CallSite[] = [];
  const usedExemptions = new Set<ComputedIdExemption>();

  for (const call of calls) {
    const site: CallSite = {
      marker: call.marker,
      path: call.path,
      line: call.line,
    };
    if (call.id === null) {
      const exemption = exemptions.find(
        (e) => e.marker === call.marker && e.path === call.path,
      );
      if (exemption) usedExemptions.add(exemption);
      else unresolvable.push(site);
      continue;
    }
    if (!found.has(call.id)) found.set(call.id, site);
    let markers = byMarker.get(call.id);
    if (!markers) byMarker.set(call.id, (markers = new Map()));
    if (!markers.has(call.marker)) markers.set(call.marker, site);
  }

  const collisions = [...byMarker]
    .filter(([, markers]) => markers.size > 1)
    .map(([id, markers]) => ({ id, sites: [...markers.values()] }));
  const staleExemptions = exemptions.filter((e) => !usedExemptions.has(e));
  return { found, unresolvable, staleExemptions, collisions };
}
