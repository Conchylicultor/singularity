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
export const AdaptiveBarPayloadSchema = z.object({
  // Which assumption broke. `no-slack` = the bar's root computed
  // `flex-grow: 0` at first layout, so the width it reads is a
  // shrink-to-content box's width and not "the room I was given";
  // `row-overflow` = on a converged pass the fit blessed the row as fitting,
  // and the union of the occupants' boxes still sticks out of the bar's own
  // content box on one side or the other, so the widths the fit decided from
  // are not the widths the row actually has; `no-convergence` = MAX_PASSES
  // measure→decide rounds and the answer was still changing; `iframe-relocation`
  // = an occupant holds an `<iframe>` and this browser has no `moveBefore()`, so
  // moving it would reload the frame and the bar refused (the only fault the
  // BROWSER causes rather than the consumer).
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
  ]),
  // The bar's accessible label ("More actions", "More controls", …). The only
  // name a generic primitive has for itself: it never learns which pane header
  // or toolbar it is, because its occupants come from plugins it cannot name.
  label: z.string(),
  // The primitive's own sentence about what went wrong and what it did instead —
  // authored at the fault site, so it is the most precise description that
  // exists. Carried for the task body; excluded from the fingerprint.
  message: z.string(),
});
export type AdaptiveBarPayload = z.infer<typeof AdaptiveBarPayloadSchema>;

// Fingerprint = sha256(fault + "\0" + label), first 16 hex chars.
//
// `label` is INCLUDED: it is the bar's accessible name, and the only identity a
// generic primitive has. Two broken bars are two findings — the pane header that
// was dropped into a `w-fit` parent and the toolbar whose fit math disagrees with
// the layout engine are different bugs in different plugins, and collapsing them
// onto one row would hide the second behind the first's count.
//
// `message` is EXCLUDED: it is a constant per fault kind, authored at the fault
// site, so including it buys no discrimination — and it would split one defect
// across several `_reports` rows the day someone edits the wording. The one
// message that is not constant (`iframe-relocation` names the offending item id)
// is exactly the one where excluding it is right too: one bar refusing to
// relocate two different iframe occupants is one situation, not two.
export async function adaptiveBarFingerprint(
  data: AdaptiveBarPayload,
): Promise<string> {
  return sha256Hex(`${data.fault}\0${data.label}`).then((h) => h.slice(0, 16));
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(buf);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}
