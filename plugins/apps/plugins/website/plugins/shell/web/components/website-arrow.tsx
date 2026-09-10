import { MdArrowForward } from "react-icons/md";

/**
 * The site's forward arrow: trails a link or button that takes the reader
 * somewhere, and steps a quarter-rem toward the destination while its control
 * is hovered or keyboard-focused — the one motion that says "this goes on".
 *
 * It reads its host through the `Button` primitive's own `group/button`, so it
 * belongs inside a `Button` (the story link, the contact call to action); one
 * component is what keeps every arrow on the site moving the same way.
 */
export function WebsiteArrow() {
  return (
    <MdArrowForward
      aria-hidden
      className="motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover/button:translate-x-1 motion-safe:group-focus-visible/button:translate-x-1"
    />
  );
}
