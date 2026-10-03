import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/**
 * Three rounded bars in the chord colours of V, IV and I (top to bottom) —
 * the mockup's mark. Painted from the theme's categorical tokens, so it
 * follows the chord palette. The app's brand mark (`Apps.App` `mark`), sized
 * by the launcher that draws it.
 */
export function ChordLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 22 22"
      aria-hidden="true"
      className={cn(rigidClass(), className)}
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
