import {
  grepCode,
  listCandidateSources,
} from "@plugins/framework/plugins/tooling/plugins/checks/core";
import {
  findMarkerCalls,
  parseStringField,
} from "@plugins/plugin-meta/plugins/parse-utils/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";
import { TIMELINE_SOURCES } from "@plugins/debug/plugins/timeline/core";
import { ACCOUNTING } from "./accounting";
import {
  COMPUTED_ID_EXEMPTIONS,
  SINK_MARKERS,
  SINK_PATHSPECS,
  inventorySinks,
  scanSinkCalls,
  type CallSite,
  type ResolvedSinkCall,
  type SinkInventory,
} from "./scan";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

// Every DURABLE sink — a `defineLogSink` log channel or a bare `defineFileSink`
// file — must be a conscious, reviewed classification in `accounting.ts`. The
// 2026-07-17 incident's root cause was a durable failure signal (an 11.5-minute
// never-ready boot on the `boot` channel) that reached NO alert funnel — it was
// persisted and then consumed by nothing. This check makes that structurally
// impossible to reintroduce silently: adding a new durable sink, or regressing
// a report/timeline wiring, fails the build.
//
// It does NOT force every sink to be a report (health is continuous). It forces
// every durable sink to be CLASSIFIED, and every report/timeline classification
// to point at something that actually exists.

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Resolve a const-named sink id (`export const NAME = "value"`) to its string
// value. maskStrings:false keeps the string literal readable while comments stay
// masked (so a commented-out declaration can't resolve it). Null when no live
// declaration is found.
async function resolveConst(
  root: string,
  name: string,
): Promise<string | null> {
  const hits = await grepCode({
    root,
    grepArg: name,
    fixed: true,
    pattern: new RegExp(
      `export\\s+const\\s+${escapeRegExp(name)}\\s*=\\s*["'][^"']+["']`,
    ),
    maskStrings: false,
  });
  for (const hit of hits) {
    const vm = /=\s*["']([^"']+)["']/.exec(hit.text);
    if (vm?.[1] !== undefined) return vm[1];
  }
  return null;
}

// The set of report kinds with a live `ReportKind({ kind: "..." })` call site.
// listCandidateSources is scan-tree + untracked aware (so a just-added kind is
// seen); findMarkerCalls full-masks (a `ReportKind(...)` written inside a
// comment or string can never match) and slices the args from the ORIGINAL, so
// the `kind` value is read back intact via parseStringField. A bare identifier
// (`kind: DB_QUERY_DEADLINE_KIND`, the single-sourced-kind-string convention)
// is resolved to its `export const` value, exactly like a sink id.
async function registeredReportKinds(root: string): Promise<Set<string>> {
  const sources = await listCandidateSources({
    root,
    grepArg: "ReportKind",
    fixed: true,
  });
  const kinds = new Set<string>();
  for (const { src } of sources) {
    for (const call of findMarkerCalls(src, "ReportKind")) {
      const res = parseStringField(call.argsText, "kind");
      if (res.kind === "value") kinds.add(res.value);
      else if (
        res.kind === "dynamic" &&
        /^[A-Za-z_$][\w$]*$/.test(res.expr.trim())
      ) {
        const value = await resolveConst(root, res.expr.trim());
        if (value !== null) kinds.add(value);
      }
    }
  }
  return kinds;
}

// Discover every durable-sink declaration, through BOTH primitives
// (defineLogSink and defineFileSink). The scan and the fold are the pure
// helpers in ./scan; this only feeds them sources and resolves `const` ids
// (`id: DURESS_EPISODES_CHANNEL`) to their declared string values.
async function findDurableSinks(root: string): Promise<SinkInventory> {
  const resolved: ResolvedSinkCall[] = [];
  for (const marker of SINK_MARKERS) {
    const sources = await listCandidateSources({
      root,
      grepArg: marker,
      fixed: true,
      pathspecs: SINK_PATHSPECS,
    });
    for (const call of scanSinkCalls(sources, marker)) {
      const id =
        call.id.kind === "literal"
          ? call.id.value
          : call.id.kind === "const"
            ? await resolveConst(root, call.id.name)
            : null;
      resolved.push({
        marker: call.marker,
        path: call.path,
        line: call.line,
        id,
      });
    }
  }
  return inventorySinks(resolved, COMPUTED_ID_EXEMPTIONS);
}

const fmtSite = (s: CallSite): string => `${s.path}:${s.line} (${s.marker})`;

const check: Check = {
  id: "durable-signals-accounted",
  description:
    "Every durable sink (defineLogSink channel or defineFileSink file) is a reviewed classification in accounting.ts, and every report/timeline classification points at a live ReportKind / TimelineSource",
  async run(): Promise<CheckResult> {
    const root = await getWorktreeRoot();
    const { found, unresolvable, staleExemptions, collisions } =
      await findDurableSinks(root);

    // Loud failure: a durable sink whose id we cannot resolve. The check cannot
    // classify what it cannot name, so this is never silently skipped.
    if (unresolvable.length > 0) {
      return {
        ok: false,
        message:
          `Durable sink call site(s) with an unresolvable id ` +
          `in ${unresolvable.length} place(s):\n    ` +
          unresolvable.map(fmtSite).join("\n    "),
        hint: 'Use a string literal or an `export const NAME = "…"` for the sink id so durable-signals-accounted can classify it in accounting.ts. A computed id whose ids are genuinely accounted elsewhere needs a named entry in COMPUTED_ID_EXEMPTIONS (check/scan.ts).',
      };
    }

    // Loud failure: an exemption that no longer excuses anything. Left in place
    // it would silently excuse the NEXT computed id written in that file.
    if (staleExemptions.length > 0) {
      return {
        ok: false,
        message:
          `COMPUTED_ID_EXEMPTIONS entr(y/ies) matching no computed-id call site:\n    ` +
          staleExemptions.map((e) => `${e.path} (${e.marker})`).join("\n    "),
        hint: "The computed-id call moved or was removed. Update or delete the exemption in check/scan.ts.",
      };
    }

    // Loud failure: one id declared through both primitives. They share one
    // accounting entry, so two files claiming it would be one reviewed decision
    // covering two different sinks.
    if (collisions.length > 0) {
      return {
        ok: false,
        message:
          `Sink id(s) declared through both defineLogSink and defineFileSink:\n    ` +
          collisions
            .map((c) => `"${c.id}": ${c.sites.map(fmtSite).join(", ")}`)
            .join("\n    "),
        hint: "A defineLogSink channel already owns a file sink under its own id. Rename one of them.",
      };
    }

    // (1) Every found durable sink is classified.
    const unclassified = [...found].filter(([id]) => !(id in ACCOUNTING));
    if (unclassified.length > 0) {
      return {
        ok: false,
        message:
          `Durable sink(s) missing from the accounting allowlist:\n    ` +
          unclassified
            .map(([id, s]) => `"${id}" (${fmtSite(s)})`)
            .join("\n    "),
        hint:
          "A NEW durable sink must be a conscious, reviewed classification. Add it to " +
          "plugins/framework/plugins/tooling/plugins/checks/plugins/durable-signals-accounted/check/accounting.ts " +
          "as consumer report (with a reportKind that has a ReportKind), timeline (with a timelineSource in TIMELINE_SOURCES), rendering-only, or internal — with an honest note. A never-consumed durable signal is exactly the 2026-07-17 gap this check exists to prevent.",
      };
    }

    // (3) Every allowlist key still has a live call site (no stale entries).
    const stale = Object.keys(ACCOUNTING).filter((id) => !found.has(id));
    if (stale.length > 0) {
      return {
        ok: false,
        message: `accounting.ts entr(y/ies) with no live defineLogSink / defineFileSink call site: ${stale.map((id) => `"${id}"`).join(", ")}`,
        hint: "The sink was removed or renamed. Delete (or update) the stale accounting.ts entry.",
      };
    }

    // (2) Coherence: report classifications resolve to a live ReportKind;
    // timeline classifications name a real TimelineSource. A report/timeline
    // entry MUST carry the corresponding field; any present field is validated.
    const reportKinds = await registeredReportKinds(root);
    const timelineSources = new Set<string>(TIMELINE_SOURCES);
    const coherence: string[] = [];
    for (const [id, spec] of Object.entries(ACCOUNTING)) {
      if (spec.consumer === "report" && spec.reportKind === undefined) {
        coherence.push(`"${id}" is classified report but has no reportKind`);
      }
      if (spec.consumer === "timeline" && spec.timelineSource === undefined) {
        coherence.push(
          `"${id}" is classified timeline but has no timelineSource`,
        );
      }
      if (spec.reportKind !== undefined && !reportKinds.has(spec.reportKind)) {
        coherence.push(
          `"${id}" → reportKind "${spec.reportKind}" has no ReportKind({ kind: "${spec.reportKind}" }) call site`,
        );
      }
      if (
        spec.timelineSource !== undefined &&
        !timelineSources.has(spec.timelineSource)
      ) {
        coherence.push(
          `"${id}" → timelineSource "${spec.timelineSource}" is not in TIMELINE_SOURCES`,
        );
      }
    }
    if (coherence.length > 0) {
      return {
        ok: false,
        message:
          `accounting.ts classification incoherent:\n    ` +
          coherence.join("\n    "),
        hint: "A report entry must name a registered ReportKind; a timeline entry must name a TIMELINE_SOURCES member. Fix the accounting.ts entry, or add the missing ReportKind.",
      };
    }

    return { ok: true };
  },
};

export default check;
