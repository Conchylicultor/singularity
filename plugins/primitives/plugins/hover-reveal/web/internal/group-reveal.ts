// Anchor: place on the element whose hover should reveal the target(s).
export const hoverRevealGroup = "group/hover-reveal";

// Target (SAFE DEFAULT): place on the element to reveal. Reveals on anchor
// hover, and on the target's OWN focus (self-scoped `focus-within`, not
// `group-focus-within`) — so a keyboard user tabbing to the affordance sees it,
// but focusing sibling *content* inside the anchor (a card/link, an input, a
// text editor, media controls, nested inline links) never reveals it.
//
// This is the key invariant: `group-focus-within` fires for ANY focusable
// descendant of the anchor, so if the anchor wraps focusable content rather than
// a dedicated trigger, that content's focus would pin the affordance open even
// after the pointer leaves — a stuck-control bug. By scoping the focus reveal to
// the target itself, that whole class of bug is impossible by default; the
// group-focus behavior is an explicit opt-in (`hoverRevealTargetWithGroupFocus`).
//
// opacity AND pointer-events are coupled, so the hidden state is never a live
// click-target. `select-none` is included unconditionally: a revealed affordance
// is chrome, never selectable content, so it must stay out of any text-selection
// range (Ctrl+A or drag) that sweeps the row beneath it. Static literals so
// Tailwind extracts them; the `hover-reveal` group name is private and never
// collides with a consumer's own named group.
export const hoverRevealTarget =
  "opacity-0 pointer-events-none select-none transition-opacity " +
  "group-hover/hover-reveal:opacity-100 group-hover/hover-reveal:pointer-events-auto " +
  "focus-within:opacity-100 focus-within:pointer-events-auto";

// Group-focus variant (OPT-IN): reveals on anchor hover OR when ANY descendant
// of the anchor is focused (`group-focus-within`). Use this ONLY when the anchor
// hosts a dedicated *trigger* — distinct from the target and not general content
// — whose focus should reveal the target. Example: a tab (`role="button"`) whose
// keyboard focus reveals its trailing `×` close.
//
// Do NOT use this when the anchor wraps focusable content (cards, links, inputs,
// text editors, media): there `group-focus-within` pins the affordance open
// after a click even once the pointer leaves. Use `hoverRevealTarget` instead —
// it reveals on the affordance's own focus, so keyboard access is preserved
// without the pinning. Same opacity ⇄ pointer-events coupling and `select-none`.
export const hoverRevealTargetWithGroupFocus =
  "opacity-0 pointer-events-none select-none transition-opacity " +
  "group-hover/hover-reveal:opacity-100 group-hover/hover-reveal:pointer-events-auto " +
  "group-focus-within/hover-reveal:opacity-100 group-focus-within/hover-reveal:pointer-events-auto";
