# adaptive-bar

The report kind for **an adaptive bar whose own layout assumptions were
violated** — see the "The one rule for consumers" section of
[`plugins/primitives/plugins/adaptive-bar/CLAUDE.md`](../../../primitives/plugins/adaptive-bar/CLAUDE.md).

The bar takes all of its row's slack and reads its own
`getBoundingClientRect().width` as the available width. Running out of room is
never a fault — compacting widgets and relocating the rest into the panel is what
the primitive is *for*, and it never reports it. A fault means the premise
underneath that width reading is false, and no amount of re-fitting can recover
from that. Four of them, discriminated by `fault` in the payload:

- **`no-slack`** — the bar's root computed `flex-grow: 0` at its first laid-out
  pass, so the width it reads is a shrink-to-content box's, not "the room I was
  given". The bar carries on, because there is no better number available to it.
- **`row-overflow`** — on a **converged** pass (rendered *is* what the fit
  decided) the fit blessed the row as fitting, and the union of the occupants'
  own boxes still sticks out of the bar's own content box on one side or the
  other. Two statements that cannot both be true.
- **`no-convergence`** — the placement was still changing after the maximum
  number of measure→decide rounds, so the widths are moving under the fit.
- **`iframe-relocation`** — an occupant holds an `<iframe>` and this browser has
  no `moveBefore()`, so relocating it would reload the frame. The bar refused and
  pinned it inline. The one fault the *browser* causes rather than the consumer.

`row-overflow` and `no-convergence` commit the **floor layout** (every unpinned
occupant at its narrowest rung) and then stop deciding *at that width*: the floor
is the one configuration that cannot overflow, and a bar that keeps re-deriving
from a broken premise is a render loop rather than a cramped row. A genuine
resize re-arms it, capped per mount — so a transient `no-convergence` (which does
happen on healthy panes) costs one cramped render, not a toolbar stuck in the
overflow panel until the pane is reopened. `renderTask` writes that out per fault
— what broke, what the user is looking at as a result, and the consumer-side fix.

This plugin **drains that sink**. The dependency deliberately runs one way: a
primitive may never import `reports`, so `AdaptiveBarCollector` (mounted via
`Core.Root`) registers the handler that maps the sink's body onto
`report({ kind: "adaptive-bar", … })` — the same inversion `reports/crash` uses
for `error-boundary`'s `boundaryReportSink`.

**Until this plugin existed, nothing registered the sink at all**, and
`defineReportSink` is a silent no-op until something does. Every adaptive-bar
fault in production was dropped while the primitive's docs promised a filed
report — which is how a fit-vs-layout disagreement took the whole Debug → Layout
Lab pane down without one row appearing anywhere
(`research/2026-08-17-global-adaptive-bar-overshoot-guard-false-positive.md`).

## The duplicated enum

`fault` is a hand-copied twin of `AdaptiveBarFaultKind`, not an import. That type
lives on the primitive's **web** barrel (it travels with the sink it describes),
and this plugin's schema is `core` — shared with the server, which must never
pull a browser runtime in. There is no `core` barrel on the primitive to import
it from, and adding one to carry a four-member enum would be a bigger seam than
the duplication.

The two are pinned together at compile time from the one place that legitimately
imports both: the collector maps an `AdaptiveBarFault` into an
`AdaptiveBarPayload` under `satisfies`. Add a fault kind to the primitive without
adding it here and the collector fails to typecheck — a `tsc` error at the seam
rather than a 400 at ingest.

## Fingerprint

`sha256(fault + "\0" + label)`, first 16 hex chars.

`label` is **included**: it is the bar's accessible name and the only identity a
generic primitive has for itself — it never learns which pane header or toolbar
it is, because its occupants come from plugins it cannot name. Two broken bars
are two findings, in two different consumers, and must not collapse onto one row
where the second hides behind the first's count.

`message` is **excluded**: it is a constant per fault kind, authored at the fault
site, so it discriminates nothing — and it would split one defect across several
`_reports` rows the day someone edits the wording. The one message that is *not*
constant (`iframe-relocation` names the offending item id) is also the one where
excluding it is right: one bar refusing to relocate two different iframe
occupants is one situation, not two.

## Re-arm

`notifCooldownMs: 6h`, like `optimistic-divergence` and `render-loop`. A broken
host produces its fault again on every mount of that surface — every time the
pane is opened — so it is a recurring warning rather than a one-shot crash, and
the bell resurfaces it periodically instead of collapsing forever onto the first
sighting.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Adaptive-bar collector: drains the adaptive-bar primitive's adaptiveBarReportSink into a deduped report whenever a bar's layout contract is violated (it was given no slack, its fit disagrees with the layout engine, its placement never converged, or it refused to relocate an iframe), plus the Debug → Reports summary view. Adaptive-bar report kind: validates the adaptive-bar primitive's layout-contract fault payloads (no-slack = the bar was given no room to give, row-overflow = on a converged pass the fit blessed the row as fitting and the occupants still stick out of the bar's own content box, no-convergence = the placement never settled, iframe-relocation = a frame the browser cannot move without reloading), fingerprints by fault + bar label (excluding the per-fault-constant message, so one broken bar = one row), and renders a per-fault task stating what the bar did instead and the consumer-side fix. Re-arms periodically (6h) since a broken host re-produces the fault on every mount.
- Web:
  - Contributes:
    - `Core.Root` → `AdaptiveBarCollector`
    - `Reports.KindView` → `AdaptiveBarKindView`
  - Uses:
    - `primitives/adaptive-bar.adaptiveBarReportSink`
    - `primitives/css/badge.Badge`
    - `primitives/css/inline.Inline`
    - `reports.report`
    - `reports.Reports`
- Server:
  - Contributes: `report-kind` "adaptive-bar"
  - Uses: `reports.ReportKind`
- Core:
  - Exports (types): `AdaptiveBarPayload`
  - Exports (values):
    - `adaptiveBarFingerprint`
    - `AdaptiveBarPayloadSchema`

<!-- AUTOGENERATED:END -->
