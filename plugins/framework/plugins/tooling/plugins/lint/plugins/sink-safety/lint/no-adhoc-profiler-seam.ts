import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/** The runtime-profiler barrel that exposes both the banned seams and the allowed pull APIs. */
const PROFILER_CORE = "@plugins/infra/plugins/runtime-profiler/core";

/**
 * The low-level observation seams. Subscribing to raw slow spans, or reading the
 * live flight window / gate gauges, is how a second perf sink starts — it is
 * exactly the near-identical twin installer that flight-recorder grew alongside
 * slow-ops. `getRuntimeProfile` (the sanctioned pull API op-rate polls) and
 * `registerGateGauge` (the gauge PRODUCER side, ~5 legit callers) live in the same
 * barrel and are deliberately NOT banned — so the rule keys on named specifiers,
 * never the module.
 */
const SEAM_NAMES = new Set([
  "onSlowSpan",
  "captureFlightWindow",
  "readGateGauges",
]);

/**
 * The sanctioned owners of the seams (in-rule, mirroring watcher-safety's
 * FILE_WATCHER_DIR): slow-ops installs the ONE onSlowSpan subscriber; the trace
 * spans/gates event classes read the flight window / gauges at the trip instant;
 * stall-monitor reads the flight window at the SAME trip instant to test span
 * coverage of a freeze (evidence-at-trip, the exact category as trace/spans, not
 * a background sink); profiling/runtime serves the live flight window on demand to
 * the Debug → Profiling Gantt pane — the pull-read UI for the flight window, which
 * `getRuntimeProfile` (a different shape: aggregates/slowest, no in-flight set)
 * cannot supply. The profiler's own internals import these by RELATIVE path
 * (`./recorder`), so they never match PROFILER_CORE and need no entry here.
 */
const OWNER_DIRS = [
  "plugins/debug/plugins/slow-ops/",
  "plugins/debug/plugins/trace/plugins/spans/",
  "plugins/debug/plugins/trace/plugins/gates/",
  "plugins/debug/plugins/stall-monitor/",
  "plugins/debug/plugins/profiling/plugins/runtime/",
];

export default createRule({
  name: "no-adhoc-profiler-seam",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow importing the runtime-profiler observation seams (onSlowSpan / " +
        "captureFlightWindow / readGateGauges) outside their sanctioned owners.",
    },
    schema: [],
    messages: {
      adhocSeam:
        "Subscribing to the raw profiler seam is how a second perf sink starts — " +
        "the near-identical twin installer flight-recorder grew alongside slow-ops. " +
        "To add a perf signal to every trace and the Gantt, contribute a " +
        "defineTraceEventClass (@plugins/debug/plugins/trace/plugins/engine/server): " +
        "the engine calls your captureAtTrip at the same coherent instant and the " +
        "signal lands in every trace automatically. For a plain profile read, use " +
        "getRuntimeProfile() from the same barrel (the sanctioned pull API). " +
        "Type-only imports are allowed.",
    },
  },
  defaultOptions: [],
  create(context) {
    const filename = (context.filename ?? context.getFilename?.() ?? "")
      .split("\\")
      .join("/");
    if (OWNER_DIRS.some((dir) => filename.includes(dir))) return {};

    // Local names bound to a `import * as prof from "…/core"` namespace import —
    // member access on these to a seam name is flagged.
    const nsLocals = new Set<string>();

    return {
      ImportDeclaration(node) {
        if (node.importKind === "type") return;
        if (node.source.value !== PROFILER_CORE) return;
        for (const spec of node.specifiers) {
          if (spec.type === "ImportSpecifier") {
            // A banned seam specifier; sibling getRuntimeProfile/registerGateGauge
            // on the same statement are ignored.
            if (
              spec.imported.type === "Identifier" &&
              SEAM_NAMES.has(spec.imported.name)
            ) {
              context.report({ node: spec, messageId: "adhocSeam" });
            }
          } else if (spec.type === "ImportNamespaceSpecifier") {
            nsLocals.add(spec.local.name);
          }
        }
      },
      // `prof.onSlowSpan(...)` on a namespace import of the profiler barrel.
      MemberExpression(node: TSESTree.MemberExpression) {
        if (node.object.type !== "Identifier") return;
        if (!nsLocals.has(node.object.name)) return;
        const prop =
          node.property.type === "Identifier"
            ? node.property.name
            : node.property.type === "Literal" &&
                typeof node.property.value === "string"
              ? node.property.value
              : null;
        if (prop && SEAM_NAMES.has(prop)) {
          context.report({ node, messageId: "adhocSeam" });
        }
      },
    };
  },
});
