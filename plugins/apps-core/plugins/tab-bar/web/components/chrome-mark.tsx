import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { APP_RAIL_WIDTH } from "@plugins/apps-core/core";

/**
 * The app's mark at the tab bar's leading edge, in the column above the rail:
 * it anchors the frame's corner and lines the first tab up with the app's own
 * left edge. The app icon's spiral (`web-core/public/icon.svg`) drawn in the
 * current text colour, so it is as quiet as the idle rail icons below it.
 * Decorative — it does nothing, so it is hidden from the a11y tree.
 */
export function ChromeMark() {
  return (
    <Center
      aria-hidden
      // eslint-disable-next-line layout/no-adhoc-layout -- rigid leading cell of the tab strip, as wide as the rail column below it
      className="h-full shrink-0"
      style={{ width: APP_RAIL_WIDTH }}
    >
      <svg viewBox="6 6 88 88" fill="none" className="size-4">
        <path
          d="M 50 12 A 38 38 0 1 1 12 50 A 28 28 0 1 0 78 50 A 18 18 0 1 1 32 50 A 8 8 0 1 0 58 50 A 2 2 0 1 1 48 50"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Center>
  );
}
