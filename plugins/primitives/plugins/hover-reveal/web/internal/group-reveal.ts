// Anchor: place on the element whose hover/focus should reveal the target(s).
export const hoverRevealGroup = "group/hover-reveal";

// Target: place on the element to reveal. opacity AND pointer-events are coupled,
// so the hidden state is never a live click-target. `select-none` is included
// unconditionally: a revealed affordance is chrome, never selectable content, so
// it must stay out of any text-selection range (Ctrl+A or drag) that sweeps the
// row beneath it. Static literals so Tailwind extracts them; the `hover-reveal`
// group name is private and never collides with a consumer's own named group.
export const hoverRevealTarget =
  "opacity-0 pointer-events-none select-none transition-opacity " +
  "group-hover/hover-reveal:opacity-100 group-hover/hover-reveal:pointer-events-auto " +
  "group-focus-within/hover-reveal:opacity-100 group-focus-within/hover-reveal:pointer-events-auto";

// Hover-only variant: reveals on group hover but NOT on focus anywhere in the
// anchor. Use this when the anchor wraps focusable *content* (e.g. a
// select-scope text region) rather than a focusable trigger for the actions —
// there, `group-focus-within` would keep the affordance pinned after a click
// even once the pointer leaves, which reads as a stuck control. The affordance
// is pure hover chrome; keyboard focus on the surrounding content must not
// reveal it. Same opacity ⇄ pointer-events coupling and `select-none` guarantee.
export const hoverRevealTargetHoverOnly =
  "opacity-0 pointer-events-none select-none transition-opacity " +
  "group-hover/hover-reveal:opacity-100 group-hover/hover-reveal:pointer-events-auto";
