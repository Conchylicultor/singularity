# adaptive-bar

The report kind for **an adaptive bar whose own layout assumptions were
violated** — see the "The one rule for consumers" section of
[`plugins/primitives/plugins/adaptive-bar/CLAUDE.md`](../../../primitives/plugins/adaptive-bar/CLAUDE.md).

The bar takes all of its row's slack and reads its own
`getBoundingClientRect().width` as the available width. Running out of room is
never a fault — compacting widgets and relocating the rest into the panel is what
the primitive is *for*, and it never reports it. A fault means the premise
underneath that width reading is false, and no amount of re-fitting can recover
from that. Five of them, discriminated by `fault` in the payload:

- **`no-slack`** — the bar's root computed `flex-grow: 0` at its first laid-out
  pass, so the width it reads is a shrink-to-content box's, not "the room I was
  given". The bar carries on, because there is no better number available to it.
- **`row-overflow`** — on a **converged** pass (rendered *is* what the fit
  decided) the fit blessed the row as fitting, and the union of the occupants'
  own boxes still sticks out of the bar's own content box on one side or the
  other. Two statements that cannot both be true.
- **`no-convergence`** — the round budget ran out and the placement was still
  changing. Which of the three round bounds tripped, and what moved, is in the
  payload's `evidence` (see below).
- **`iframe-relocation`** — an occupant holds an `<iframe>` and this browser has
  no `moveBefore()`, so relocating it would reload the frame. The bar refused and
  pinned it inline. The one fault the *browser* causes rather than the consumer.
- **`empty-rung`** — a widget declared a smaller form
  (`useActionForm({ shrinksTo: ["compact"] })`) and then rendered **nothing** as
  it. The one fault the *contributor* causes rather than the host or the browser,
  and the fix is always in the widget: render something as that form, or stop
  declaring it. The bar recovers by itself — it cuts that occupant's ladder short
  and relocates it instead — which is why it has to say so, or a control silently
  loses a form. A contribution that renders nothing **at all** is ordinary,
  supported, and never reported.

`row-overflow` and `no-convergence` both stop deciding *at that width* — a bar
that keeps re-deriving from a broken premise is a render loop, not a cramped row
— but they do **not** commit the same thing, and `renderTask` must not say they
do. `row-overflow` takes the **floor** (every unpinned occupant at its narrowest
rung), because the engine has just contradicted the fit's own arithmetic and
"the widest placement the fit blessed" is the claim under suspicion.
`no-convergence` takes the **widest placement the search measured as fitting at
this width**, falling back to the floor only when it produced none. Eviction is
part of the floor in `panel` mode alone: `clip` and `scroll` keep every occupant
inline, since a clip bar's evictions land in a hidden dock. A genuine resize
re-arms either, capped per mount.

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

## The duplicated shapes

`fault`, `overflow` and `evidence` are hand-copied twins of
`AdaptiveBarFaultKind`, `AdaptiveBarOverflow` and `ConvergenceEvidence`, not
imports. The first two live on the primitive's **web** barrel (they travel with
the sink they describe) and this plugin's schema is `core`, shared with the
server, which must never pull a browser runtime in. `ConvergenceEvidence` *is*
importable from the primitive's `core` — the duplication is kept anyway, because
the schema is the wire-and-DB contract for rows already stored, and it must be
free to stay still while the primitive's internal type moves.

They are pinned at compile time from the one place that legitimately imports
both: the collector maps an `AdaptiveBarFault` into an `AdaptiveBarPayload` under
`satisfies`. A fault kind, overflow mode or evidence field that is added,
renamed, retyped or removed on the primitive fails to typecheck there rather than
400-ing at ingest. One direction only — a field *added* to `ConvergenceEvidence`
stays assignable, so it is silently not carried until someone adds it here.

## Fingerprint

`sha256(fault + "\0" + (origin ?? label) + "\0" + (overflow ?? "") + "\0" + (item?.id ?? ""))`,
first 16 hex chars.

`origin` is the **identity**, and `label` is only its stand-in. The label is the
name the consumer gave the bar, and it is not an identity: it defaults to
`"More"`, and two unrelated bars on one route take that default today — the app
tab strip and the pinned prompt-template chips — so fingerprinting on it
collapses two findings onto one row and hides the second behind the first's
count. `origin` is the innermost UI-context node above the bar's root
(`apps-core.tab-bar@apps.tab-bar`), which names the composition that wrote the
bar and reads the same on every mount of it. Where there is no lineage to read (a
fixture, a story) and on rows filed before the field existed, `label` stands in,
so every reader falls back the same way.

`overflow` is **included**: free, already enough to separate those two colliding
`"More"` bars on its own (the tab strip is `scroll`, the chips are `clip`), and
it changes what a fault's remedy is allowed to do — so two faults differing in it
are genuinely two findings.

`originPath` is **excluded** despite being the more precise string, for the same
reason `origin` is included: it embeds the per-instance pane and tab ids, so one
broken bar opened in two conversation panes would split into two rows — the
mirror of the collision above. It is carried for the task body, which is where
"which pane was this" belongs.

`item.id` is **included**, and it is the one field that separates findings with
different *owners*. A bar holding three widgets that each declared a form they do
not render is three bugs in three plugins; collapsing them onto one row hides two
of them behind the first one's count. It is empty for every other fault kind,
which is why folding it in cost those kinds nothing beyond a one-time
re-fingerprint. `item.rung` and `item.form` are excluded — they are the same fact
said twice, and one widget cannot vanish at two rungs while its ladder is cut at
the first.

`evidence` is **excluded**: every field of it is per-occurrence. Round counts and
pixel widths differ on each sighting of one defect, so folding them in would mint
a fresh `_reports` row per occurrence and destroy the count that says how often
this bar is failing.

`message` is **excluded**: it is a constant per fault kind, authored at the fault
site, so it discriminates nothing — and it would split one defect across several
`_reports` rows the day someone edits the wording. The two messages that are
*not* constant (`iframe-relocation` names the offending item id,
`no-convergence` names the round counts and which branch the surrender took) are
also the ones where excluding it is right: one bar refusing to relocate two
different iframe occupants, or failing to settle after seven rounds and then
after nine, is one situation and not two.

## The evidence

`no-convergence` is frequently **transient** — a font landing mid-pass, a late
icon, a widget re-rendering between measure and decide — and it fires on
perfectly healthy surfaces. A transient that records nothing can never be
diagnosed, so that one fault carries the bar's own summary of its rounds, and
the task renders it as a finding rather than a dump:

- **which occupant resized itself** (id, rung, from → to px) at a rung it was
  already sitting at. Nothing the fit did explains such a width, so this is the
  usual culprit and the first thing the "How to fix" section names;
- **whether the row itself moved** (the distinct widths the episode decided
  from). One width means the placement kept changing while its premise held
  still, which puts the blame inside the bar; several mean the page was resizing
  underneath, and a bar re-deciding through a resize is not misbehaving;
- **the three counters** — rounds at a still premise, premise moves without
  settling, and rounds since the last settled answer — which say *which* bound
  tripped, and therefore which of the three diagnoses this is;
- **whether a placement repeated**, which is a cycle in the fit itself as
  opposed to a premise that keeps moving.

Bounded at the source (at most 4 named occupants, 6 widths) and bounded again in
the schema, so the `data` column can never take a data dump.

Everything in it is optional at the type level and absent on older rows: the
task renderer's `.parse` is total, so a row filed before the bar recorded rounds
is a legal row, not a corrupt one, and every renderer handles its absence.

## Re-arm

`notifCooldownMs: 6h`, like `optimistic-divergence` and `render-loop`. A broken
host produces its fault again on every mount of that surface — every time the
pane is opened — so it is a recurring warning rather than a one-shot crash, and
the bell resurfaces it periodically instead of collapsing forever onto the first
sighting.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Adaptive-bar collector: drains the adaptive-bar primitive's adaptiveBarReportSink into a deduped report whenever a bar's layout contract is violated (it was given no slack, its fit disagrees with the layout engine, its placement never converged, it refused to relocate an iframe, or one of its widgets declared a form it does not render), plus the Debug → Reports summary view. Adaptive-bar report kind: validates the adaptive-bar primitive's layout-contract fault payloads (no-slack = the bar was given no room to give, row-overflow = on a converged pass the fit blessed the row as fitting and the occupants still stick out of the bar's own content box, no-convergence = the placement never settled, iframe-relocation = a frame the browser cannot move without reloading, empty-rung = a widget declared a smaller form and rendered nothing as it), fingerprints by fault + origin (the innermost UI-context node above the bar's root, falling back to the label that several unrelated bars share) + overflow mode + the offending occupant's id, excluding the per-occurrence lineage path, round evidence and message so one broken bar = one row, and renders a per-fault task — what the bar did instead, the consumer-side fix, and for no-convergence the recorded rounds naming which occupant resized itself. Re-arms periodically (6h) since a broken host re-produces the fault on every mount.
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
