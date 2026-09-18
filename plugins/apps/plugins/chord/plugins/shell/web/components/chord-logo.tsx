import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";

/**
 * Three rounded bars in the chord colours of V, IV and I (top to bottom) —
 * the mockup's mark. Painted from the theme's categorical tokens, so it
 * follows the chord palette.
 */
export function ChordLogo() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 22 22"
      aria-hidden="true"
      className={rigidClass()}
    >
      <rect
        x="3"
        y="3"
        width="16"
        height="4"
        rx="2"
        className="fill-categorical-5"
      />
      <rect
        x="3"
        y="9"
        width="12"
        height="4"
        rx="2"
        className="fill-categorical-4"
      />
      <rect
        x="3"
        y="15"
        width="16"
        height="4"
        rx="2"
        className="fill-categorical-1"
      />
    </svg>
  );
}
