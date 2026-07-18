import {
  grepCode,
  listCandidateSources,
} from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { findMarkerCalls, lineAt, parseStringField } from "@plugins/plugin-meta/plugins/parse-utils/core";
import { TIMELINE_SOURCES } from "@plugins/debug/plugins/timeline/core";
import { ACCOUNTING } from "./accounting";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

// Every DURABLE (`defineLogSink`-declared) log channel must be a conscious,
// reviewed classification in `accounting.ts`. The 2026-07-17 incident's root
// cause was a durable failure signal (an 11.5-minute never-ready boot on the
// `boot` channel) that reached NO alert funnel — it was persisted and then
// consumed by nothing. This check makes that structurally impossible to
// reintroduce silently: adding a new durable sink, or regressing a
// report/timeline wiring, fails the build.
//
// It does NOT force every channel to be a report (health is continuous). It
// forces every persisted channel to be CLASSIFIED, and every report/timeline
// classification to point at something that actually exists.

interface CallSite {
  path: string;
  line: number;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

// Resolve a const-named channel id (`export const NAME = "value"`) to its string
// value. maskStrings:false keeps the string literal readable while comments stay
// masked (so a commented-out declaration can't resolve it). Null when no live
// declaration is found.
async function resolveConst(root: string, name: string): Promise<string | null> {
  const hits = await grepCode({
    root,
    grepArg: name,
    fixed: true,
    pattern: new RegExp(`export\\s+const\\s+${escapeRegExp(name)}\\s*=\\s*["'][^"']+["']`),
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
// the `kind` value is read back intact via parseStringField.
async function registeredReportKinds(root: string): Promise<Set<string>> {
  const sources = await listCandidateSources({ root, grepArg: "ReportKind", fixed: true });
  const kinds = new Set<string>();
  for (const { src } of sources) {
    for (const call of findMarkerCalls(src, "ReportKind")) {
      const res = parseStringField(call.argsText, "kind");
      if (res.kind === "value") kinds.add(res.value);
    }
  }
  return kinds;
}

// Discover every durable-sink declaration. Returns the id → first-call-site map
// plus any unresolvable call sites (a computed id, or a const with no live
// declaration). A `defineLogSink({ id, description })` call is multi-line (the
// `id:` field sits on its own line), so detection is AST-shaped, NOT line-based:
// listCandidateSources is scan-tree + untracked aware (a just-added sink is
// seen), findMarkerCalls full-masks (a `defineLogSink(...)` written in a comment
// or string never matches) and slices the args from the ORIGINAL, so the `id`
// field is read back intact via parseStringField. A string-literal id resolves
// directly; a bare `const` reference (`id: DURESS_EPISODES_CHANNEL`) is resolved
// to its declared string value.
async function findPersistedChannels(
  root: string,
): Promise<{ found: Map<string, CallSite>; unresolvable: CallSite[] }> {
  const sources = await listCandidateSources({ root, grepArg: "defineLogSink", fixed: true });

  const found = new Map<string, CallSite>();
  const unresolvable: CallSite[] = [];
  for (const { rel, src } of sources) {
    for (const call of findMarkerCalls(src, "defineLogSink")) {
      // Skip the primitive's OWN definition (`export function defineLogSink(spec:
      // { id: string; … })`): a real declaration passes an inline object literal,
      // so its args begin with `{`; the function signature's begin with `spec:`.
      // Any non-literal arg cannot carry a static id anyway, so this is safe.
      if (!/^\s*\{/.test(call.argsText)) continue;
      const site: CallSite = { path: rel, line: lineAt(src, call.index) };
      const res = parseStringField(call.argsText, "id");
      let id: string | null;
      if (res.kind === "value") {
        id = res.value;
      } else if (res.kind === "dynamic") {
        // A `const`-named id (`id: DURESS_EPISODES_CHANNEL`): resolve the
        // identifier to its declared string value; unresolvable if no live decl.
        id = await resolveConst(root, res.expr);
      } else {
        // No static `id` field at all — cannot be classified.
        id = null;
      }
      if (id === null) {
        unresolvable.push(site);
        continue;
      }
      if (!found.has(id)) found.set(id, site);
    }
  }
  return { found, unresolvable };
}

const check: Check = {
  id: "durable-signals-accounted",
  description:
    "Every persisted (durable) log channel is a reviewed classification in accounting.ts, and every report/timeline classification points at a live ReportKind / TimelineSource",
  async run(): Promise<CheckResult> {
    const root = await getRoot();
    const { found, unresolvable } = await findPersistedChannels(root);

    // Loud failure: a persisted channel whose id we cannot resolve. The check
    // cannot classify what it cannot name, so this is never silently skipped.
    if (unresolvable.length > 0) {
      return {
        ok: false,
        message:
          `Durable defineLogSink call site(s) with an unresolvable channel id ` +
          `in ${unresolvable.length} place(s):\n    ` +
          unresolvable.map((s) => `${s.path}:${s.line}`).join("\n    "),
        hint: "Use a string literal or an `export const NAME = \"…\"` for the channel id so durable-signals-accounted can classify it in accounting.ts.",
      };
    }

    // (1) Every found persisted channel is classified.
    const unclassified = [...found].filter(([id]) => !(id in ACCOUNTING));
    if (unclassified.length > 0) {
      return {
        ok: false,
        message:
          `Persisted log channel(s) missing from the accounting allowlist:\n    ` +
          unclassified.map(([id, s]) => `"${id}" (${s.path}:${s.line})`).join("\n    "),
        hint:
          "A NEW durable channel must be a conscious, reviewed classification. Add it to " +
          "plugins/framework/plugins/tooling/plugins/checks/plugins/durable-signals-accounted/check/accounting.ts " +
          "as consumer report (with a reportKind that has a ReportKind), timeline (with a timelineSource in TIMELINE_SOURCES), rendering-only, or internal — with an honest note. A never-consumed durable signal is exactly the 2026-07-17 gap this check exists to prevent.",
      };
    }

    // (3) Every allowlist key still has a live call site (no stale entries).
    const stale = Object.keys(ACCOUNTING).filter((id) => !found.has(id));
    if (stale.length > 0) {
      return {
        ok: false,
        message: `accounting.ts entr(y/ies) with no live defineLogSink call site: ${stale.map((id) => `"${id}"`).join(", ")}`,
        hint: "The channel was removed or renamed. Delete (or update) the stale accounting.ts entry.",
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
        coherence.push(`"${id}" is classified timeline but has no timelineSource`);
      }
      if (spec.reportKind !== undefined && !reportKinds.has(spec.reportKind)) {
        coherence.push(
          `"${id}" → reportKind "${spec.reportKind}" has no ReportKind({ kind: "${spec.reportKind}" }) call site`,
        );
      }
      if (spec.timelineSource !== undefined && !timelineSources.has(spec.timelineSource)) {
        coherence.push(
          `"${id}" → timelineSource "${spec.timelineSource}" is not in TIMELINE_SOURCES`,
        );
      }
    }
    if (coherence.length > 0) {
      return {
        ok: false,
        message: `accounting.ts classification incoherent:\n    ` + coherence.join("\n    "),
        hint: "A report entry must name a registered ReportKind; a timeline entry must name a TIMELINE_SOURCES member. Fix the accounting.ts entry, or add the missing ReportKind.",
      };
    }

    return { ok: true };
  },
};

export default check;
