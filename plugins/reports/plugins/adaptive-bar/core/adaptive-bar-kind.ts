import { z } from "zod";

// The adaptive-bar report payload, stored in the generic `data` jsonb column and
// validated on ingest by the adaptive-bar ReportKind. Mirrors
// `AdaptiveBarFault`, the neutral body the adaptive-bar primitive emits into
// `adaptiveBarReportSink` when one of its own layout assumptions is violated —
// this schema is the ingest-side contract for that same shape.
//
// The primitive takes ALL of its row's slack and reads its own
// `getBoundingClientRect().width` as the available width (see
// `plugins/primitives/plugins/adaptive-bar/CLAUDE.md`, "The one rule for
// consumers"). Running out of room is never a fault — relocating widgets into
// the panel is what the bar is FOR. A fault means the premise underneath that
// width reading is false, which no amount of re-fitting can recover from.

// What the bar established about a `no-convergence` before it stopped deciding,
// so nobody has to reproduce a transient to find out what moved. Mirrors
// `ConvergenceEvidence` in the primitive's `core/round-trace.ts`; present on
// that one fault, because the other three have no rounds to summarise.
//
// The bounds are the EMITTER's own, restated: the primitive keeps a ring of
// `TRACE_ROUNDS` (6) rounds and names at most `MAX_NAMED` (4) occupants, so
// neither `.max()` can reject anything it legitimately sends today. They are
// here so that an emitter which one day grew a data dump is a loud 400 at ingest
// rather than an unbounded blob living forever in the `data` jsonb column.
//
// Unknown keys are STRIPPED rather than rejected (a plain `z.object`): a field
// added upstream must degrade to "this report does not carry it yet", never to
// "every fault on this build is dropped at ingest". The compile-time pin in the
// web collector is what notices a field that was renamed, retyped or removed;
// a pure addition is invisible to it, which is the one direction this schema
// deliberately trades away.
const ConvergenceEvidenceSchema = z.object({
  // Rounds spent at a premise that held still — the search's own cost, and the
  // only one of the three counters that accuses the fit rather than the page.
  rounds: z.number(),
  // Times the widths underneath the bar moved without the placement ever
  // settling. A moving premise is a different bug from a search that will not
  // converge, and it belongs to whatever is resizing, not to the bar.
  shifts: z.number(),
  // Rounds since the last settled answer, whatever the reason. The counter
  // nothing resets — it is what bounds the whole loop.
  total: z.number(),
  // The distinct row widths this episode decided from, oldest first. One entry
  // means the row held still while everything else moved, which is the reading
  // that convicts an occupant.
  widths: z.array(z.number()).max(6),
  // Occupants whose own rendered width moved at a rung they were ALREADY
  // sitting at — nothing the search did explains those, so they are the usual
  // culprit. `from`/`to` bracket the movement rather than logging every flip.
  moved: z
    .array(
      z.object({
        id: z.string(),
        rung: z.number(),
        from: z.number(),
        to: z.number(),
      }),
    )
    .max(4),
  // A placement the episode had already produced came back: a genuine cycle in
  // the fit, and the one case where blaming the search is right.
  cycled: z.boolean(),
});

export const AdaptiveBarPayloadSchema = z.object({
  // Which assumption broke. `no-slack` = hiding every occupant the bar
  // currently holds and re-reading the row's own width moved the number, so
  // the width it reads is a shrink-to-content box's — its own content's, not
  // "the room I was given" (`flex-grow` alone reads `1` in this case too,
  // since the bar sets `flex-1` on itself, which is why that cheaper check
  // can never catch it); the bar then stops deciding for good, putting every
  // occupant back at its widest form and leaving whatever does not fit for
  // CSS to clip;
  // `row-overflow` = on a converged pass the fit blessed the row as fitting,
  // and the union of the occupants' boxes still sticks out of the bar's own
  // content box on one side or the other, so the widths the fit decided from
  // are not the widths the row actually has; `no-convergence` = the round budget
  // ran out and the placement was still changing (see `evidence` below, which
  // says which of the three round bounds tripped); `iframe-relocation`
  // = an occupant holds an `<iframe>` and this browser has no `moveBefore()`, so
  // moving it would reload the frame and the bar refused (the only fault the
  // BROWSER causes rather than the consumer); `empty-rung` = a widget declared a
  // smaller form (`useActionForm({ shrinksTo: [...] })`) and then rendered
  // NOTHING as it, so the bar stopped offering that form — the only fault the
  // CONTRIBUTOR causes rather than the host.
  //
  // This enum is a deliberate DUPLICATE of `AdaptiveBarFaultKind` in
  // `plugins/primitives/plugins/adaptive-bar/web/internal/diagnostics.ts`, not an
  // import: that type lives on the primitive's WEB barrel (it travels with the
  // sink it describes), and this file is `core` — shared with the server, which
  // must never pull a browser runtime in. The two are pinned together at
  // compile time from the one place that legitimately imports both: the web
  // collector maps an `AdaptiveBarFault` into an `AdaptiveBarPayload` under
  // `satisfies`, so adding a fault kind to the primitive without adding it here
  // is a type error at the seam rather than a 400 at ingest.
  fault: z.enum([
    "no-slack",
    "row-overflow",
    "no-convergence",
    "iframe-relocation",
    "empty-rung",
  ]),
  // The bar's accessible label ("More actions", "More controls", …) — the name
  // its own consumer gave it. Carried because it is what a human greps for at
  // the call site, but NOT an identity: it defaults to `"More"` (see the
  // fingerprint comment below).
  label: z.string(),
  // Where the bar is written, as an id-free composition identity: the innermost
  // UI-context node above the bar's root, e.g. `apps-core.tab-bar@apps.tab-bar`
  // for the app tab strip. This is the field that actually tells two bars apart,
  // and it is the fingerprint's primary key.
  //
  // Optional in both directions of time: a page carrying no UI-context lineage
  // at all (a fixture, a story) has no answer to give, and every row filed
  // before this field existed has none stored. Every reader must therefore fall
  // back to `label`.
  origin: z.string().optional(),
  // The full lineage path — every node from the app root down to the bar,
  // including the per-instance region ids. Informational only: it says WHICH
  // pane or tab the bar was in, which is what a reader wants and exactly what a
  // fingerprint must not contain.
  originPath: z.string().optional(),
  // The bar's overflow mode: what happens to an occupant the row cannot fit.
  // `panel` = relocate it behind the `⋯`; `scroll` = nothing leaves and the row
  // scrolls; `clip` = drop it (legitimate only where the host has a second route
  // to the content).
  //
  // Fingerprinted, because it costs nothing and already separates today's two
  // colliding `"More"` bars, and carried because it decides what a fault's
  // remedy is ALLOWED to do — a `clip` bar must never park occupants in the
  // hidden dock, so its floor keeps them all inline. A reader who does not know
  // the mode cannot tell whether what the bar did was right.
  //
  // A deliberate DUPLICATE of `AdaptiveBarOverflow`, for the same reason as the
  // fault enum above and pinned by the same `satisfies` in the web collector.
  overflow: z.enum(["panel", "scroll", "clip"]).optional(),
  // The primitive's own sentence about what went wrong and what it did instead —
  // authored at the fault site, so it is the most precise description that
  // exists. Carried for the task body; excluded from the fingerprint.
  message: z.string(),
  // Which occupant the fault is about, where it is about one. Only `empty-rung`
  // has a subject that is a specific CONTRIBUTOR rather than the bar's host, and
  // the id is what a reader filters on — so it is a typed field rather than only
  // a phrase inside `message`. `form` is the ActionForm name the widget refused
  // to render ("compact"), kept as a plain string because the form set lives on
  // the primitive's WEB barrel and this file is `core`; the same `satisfies` pin
  // in the collector catches a rename.
  item: z
    .object({ id: z.string(), rung: z.number(), form: z.string() })
    .optional(),
  // The `no-convergence` finding. Absent on the other four faults, and absent
  // on every row filed before the bar started recording rounds.
  evidence: ConvergenceEvidenceSchema.optional(),
});
export type AdaptiveBarPayload = z.infer<typeof AdaptiveBarPayloadSchema>;

// Fingerprint = sha256(fault + "\0" + (origin ?? label) + "\0" + (overflow ?? "")
//                       + "\0" + (item?.id ?? "")), first 16 hex chars.
//
// `origin` is the identity, and `label` is only its fallback. That is the
// correction of a real collision rather than a refinement: `label` defaults to
// `"More"`, and two unrelated bars on one route take that default today — the
// app tab strip and the pinned prompt-template chips — so a fault fingerprinted
// on the label alone collapses them onto one row and hides the second behind the
// first's count. `origin` is the innermost UI-context node above the bar's root
// (`apps-core.tab-bar@apps.tab-bar`), which names the composition that wrote the
// bar and is the same string on every mount of it. Where there is no lineage to
// read (a fixture, a story) and on rows filed before the field existed, `label`
// is still the best name available, so it stands in.
//
// `overflow` is INCLUDED: it is free, it separates exactly those two colliding
// `"More"` bars on its own (the tab strip is `scroll`, the chips are `clip`),
// and it changes what the bar is allowed to do about a fault — so two faults
// that differ in it are genuinely two findings.
//
// `originPath` is EXCLUDED even though it is the more precise string, and for
// the same reason `origin` is included: it embeds the per-instance pane and tab
// ids, so one broken bar opened in two conversation panes would split into two
// rows — the mirror of the collision above.
//
// `item.id` is INCLUDED, and it is the one field that separates findings with
// different OWNERS: a bar holding three widgets that each declared a form they
// do not render is three bugs in three plugins, and collapsing them onto one row
// would hide two of them behind the first one's count. It is empty for every
// other fault kind, which is why folding it in cost those kinds nothing but a
// one-time re-fingerprint (the kind was one day old, with a single row in it).
// `item.rung`/`item.form` are excluded: they are the same fact said twice, and
// one widget cannot vanish at two rungs while its ladder is cut at the first.
//
// `evidence` is EXCLUDED: every field of it is per-occurrence. The round
// counters and the pixel widths differ on each sighting of one defect, so
// folding them in would mint a fresh `_reports` row per occurrence and destroy
// the count that says how often this bar is failing.
//
// `message` is EXCLUDED: it is a constant per fault kind, authored at the fault
// site, so including it buys no discrimination — and it would split one defect
// across several `_reports` rows the day someone edits the wording. Two of them
// are not constant (`iframe-relocation` names the offending item id,
// `no-convergence` names the round counts and which branch the surrender took),
// and those are exactly the ones where excluding it is right too: one bar
// refusing to relocate two different iframe occupants, or failing to settle
// after seven rounds and then after nine, is one situation and not two.
export async function adaptiveBarFingerprint(
  data: AdaptiveBarPayload,
): Promise<string> {
  const identity = data.origin ?? data.label;
  return sha256Hex(
    `${data.fault}\0${identity}\0${data.overflow ?? ""}\0${data.item?.id ?? ""}`,
  ).then((h) => h.slice(0, 16));
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(buf);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}
