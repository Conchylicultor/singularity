import { z } from "zod";

// The viewport-escape report payload, stored in the generic `data` jsonb column
// and validated on ingest by the viewport-escape ReportKind. Mirrors
// `ViewportEscapeFault`, the neutral body the viewport-overlay primitive emits
// into `viewportEscapeReportSink` when a box that is supposed to be measured
// against the viewport turns out not to be.
//
// Neither fault is a layout preference: a `fixed inset-0` box either resolves
// against the viewport and paints in the root stacking context, or it does not.
// What makes them worth a report rather than a console line is that both look
// ALMOST right — a fullscreen that is 40px short, a fullscreen with the app rail
// still down the side — so they survive review and ship.
export const ViewportEscapePayloadSchema = z.object({
  // Which of the two promises broke. `viewport-containing-block` = an ancestor
  // declares `transform` / `filter` / `contain` / `container-type` /
  // `will-change`, so it — not the viewport — is the containing block for the
  // fixed box, which is therefore clipped to that element's content area;
  // `viewport-stacking-context` = an ancestor opens a stacking context
  // (`opacity` < 1, `isolation`, a blend mode, a positioned element with a
  // numeric `z-index`), so the box's z-index is compared inside that layer and
  // it stops out-painting the chrome beside it however high it is set.
  //
  // This enum is a deliberate DUPLICATE of `ViewportEscapeFaultKind` in
  // `plugins/primitives/plugins/css/plugins/viewport-overlay/web/internal/viewport-escape.ts`,
  // not an import: that type lives on the primitive's WEB barrel (it travels
  // with the sink it describes), and this file is `core` — shared with the
  // server, which must never pull a browser runtime in. The two are pinned
  // together at compile time from the one place that legitimately imports both:
  // the web collector maps a `ViewportEscapeFault` into a
  // `ViewportEscapePayload` under `satisfies`, so a fault kind added to the
  // primitive is a type error HERE rather than a 400 at ingest.
  fault: z.enum(["viewport-containing-block", "viewport-stacking-context"]),
  // What the caller said breaks — "a fullscreen (solo) tab", `a
  // <ViewportOverlay layer="popover">`. The auditor is pure CSS and has no name
  // for the thing it is protecting, so the consumer supplies one; it is also the
  // only signal that separates two different consumers' faults.
  subject: z.string(),
  // The offending ancestor as the auditor described it (`div.relative.h-full`,
  // `html`) — a STRING, because a report is a POST and the element is long gone
  // by the time anyone reads the row.
  blocker: z.string(),
  // The primitive's own sentence: subject, blocker, the exact declaration and
  // the symptom. Authored at the fault site, so it is the most precise
  // description that exists. Carried for the task body; excluded from the
  // fingerprint, because it embeds the computed VALUE (a transform matrix
  // changes every scroll).
  message: z.string(),
});
export type ViewportEscapePayload = z.infer<typeof ViewportEscapePayloadSchema>;

// Fingerprint = sha256(fault + "\0" + subject + "\0" + blocker), first 16 hex.
//
// `subject` and `blocker` are INCLUDED: they are the (what broke, who broke it)
// pair, and that pair IS the defect. A solo tab clipped by a surface backdrop
// and an overlay clipped by a `filter` on `<body>` are two different bugs, in
// two different plugins, and collapsing them onto one row would hide the second
// behind the first's count.
//
// `message` is EXCLUDED, and specifically because it quotes the computed value:
// `transform: matrix(1, 0, 0, 1, 0, 240)` changes on every scroll of the
// offending ancestor, so fingerprinting it would file a fresh row per frame for
// one defect. The property name is already implied by the (subject, blocker)
// pair for every case that matters — one element rarely breaks the chain two
// different ways at once, and if it does, the first fix removes both.
export async function viewportEscapeFingerprint(
  data: ViewportEscapePayload,
): Promise<string> {
  return sha256Hex(`${data.fault}\0${data.subject}\0${data.blocker}`).then(
    (h) => h.slice(0, 16),
  );
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(buf);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}
