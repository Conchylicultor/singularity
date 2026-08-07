import type { PriceTable } from "./price-table";

// ─── Vendored LiteLLM snapshot ────────────────────────────────────────────────
//
// A FLOOR, not the source of truth. Its only job is to make the very first boot
// on a machine with no persisted price table — and no network — produce real
// numbers instead of a corpus full of unknown-model buckets. `mergePriceTable`
// layers every fetched table on top of it, and never deletes a key, so this
// snapshot going stale can only ever leave prices that upstream has since
// dropped — which is exactly what we want it to do.
//
// ── Why the rates live in a sibling `.json` and not in this file ─────────────
//
// They are vendored DATA, not code: 258 rows nobody hand-edits, regenerated
// wholesale by the command below. Holding them as a `.ts` const also put 154
// literal Claude model ids into a `.ts` file, which is what
// `model-provider:no-raw-model-flags` exists to forbid — and rightly so: the
// check cannot tell a vendored price key from a hardcoded CLI flag, and the
// honest fix is to stop presenting the table as source. A dynamic `import()` of
// JSON is bundled by Bun like any other module, so this survives
// `bun build --compile` into a release artifact; it is not a runtime filesystem
// read.
//
// The JSON sits HERE rather than under `shared/` (where the analogous tweakcn
// community catalog lives) because `shared/` means "web↔server DRY within this
// plugin", and this data is server-only — colocating it with its single
// consumer is the more honest placement.
//
// Regenerate (after a LiteLLM pricing change worth vendoring) — the file is
// literally `parseLiteLlmTable(upstream)` serialized, so regeneration is that
// call plus a write:
//
//   curl -sL https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json -o /tmp/litellm.json
//   bun -e 'const {parseLiteLlmTable} = await import("./plugins/stats/plugins/cost/server/internal/price-table.ts");
//     const t = parseLiteLlmTable(JSON.parse(await Bun.file("/tmp/litellm.json").text()), Date.now());
//     const rows = Object.keys(t.models).sort().map((k) => `    ${JSON.stringify(k)}: ${JSON.stringify(t.models[k])}`);
//     await Bun.write("plugins/stats/plugins/cost/server/internal/litellm-fallback.json",
//       `{\n  "fetchedAt": ${t.fetchedAt},\n  "models": {\n${rows.join(",\n")}\n  }\n}\n`);'
//
// Snapshot taken 2026-08-06 — 258 Anthropic-relevant models, filtered and mapped
// by `parseLiteLlmTable`, so the JSON is exactly what that parse produces
// (including the 1h cache-creation rate ccusage's schema omits). Its `fetchedAt`
// is the frozen stamp of that snapshot, never `Date.now()`.

// Memoized as a PROMISE (not the resolved value) so concurrent first callers
// share one parse instead of racing two. Lazy also keeps ~41 KB of rates off the
// boot path — only a process that actually prices a bucket with no persisted
// table ever pays for it.
let fallbackPromise: Promise<PriceTable> | undefined;

/** The vendored table, ready for `mergePriceTable` to layer a fetched one on top. */
export function loadFallbackPriceTable(): Promise<PriceTable> {
  if (fallbackPromise === undefined) {
    fallbackPromise = import("./litellm-fallback.json").then((mod) => mod.default as PriceTable);
  }
  return fallbackPromise;
}
