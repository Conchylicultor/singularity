import {
  Button,
  ControlSizeProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import {
  runsLength,
  runsOf,
  type Block,
  type BlockTextVariant,
} from "../../core";
import type { CollabBlockDoc } from "../internal/use-collab-block-doc";
import { TEXT_VARIANT_CLASS } from "./text-variant-class";

/**
 * Narrowest and widest a hydration skeleton may be, in `ch` of the block's own
 * type scale. The row's projected length is a rough shape, not a measurement
 * (it counts a decorator as its whole `[[…]]` token, and knows nothing about
 * wrapping), so it is clamped rather than trusted: short enough that a one-word
 * block does not get a full-width bar, capped so a long paragraph does not
 * promise a line it will not fill.
 */
const SKELETON_MIN_CH = 6;
const SKELETON_MAX_CH = 48;

/**
 * What a block shows while its content session has not PROVEN that the text on
 * screen is the text its doc holds (`collab-session.ts` owns the state; this is
 * the only thing that renders it).
 *
 * A ladder, read top to bottom. The order IS the policy:
 *
 * - **`hydrated`** — nothing. The block renders its own text.
 * - **`stalled`** — a VISIBLE retry (`rehydrate()` — end this session, start a
 *   new one). The binding demonstrably renders less than its replica holds,
 *   which is a real defect with a real remedy, so it must not sit behind an
 *   indefinite skeleton. It stays ABOVE the latch below deliberately: it is
 *   right-aligned and covers nothing, and a partially-rendering binding still
 *   owes the user a way out. It never covers the start of the line the user can
 *   keep typing into either — `hydrating` gates the WRITE path, not the editing
 *   host (see `collab-session.ts`), so the block stays live throughout.
 * - **`everRendered`** — nothing. This block's text HAS been on screen, so a
 *   skeleton here would be a loading state painted over something the user was
 *   reading a moment ago. The latch lives on the block's content owner, so it
 *   survives both things that would otherwise reset it: a `rehydrate()` (which
 *   mints a new session) and a Lexical remount (indent/outdent reparents the
 *   DOM). What is on screen may be STALE — that is what the recovery is for —
 *   but stale text beats a blank line, and the recovery no longer blanks it.
 * - **row says there IS text** (`runsLength(runsOf(data.text)) > 0`, the same
 *   witness `BlockTextEditor` reads for `isEmpty`) — a skeleton roughly the
 *   row's length. The row is the independent evidence that something is coming;
 *   without it, "the editor is empty right now" is indistinguishable from an
 *   empty block.
 * - **row says the block is EMPTY** — nothing at all, deliberately. An empty
 *   paragraph is the normal state of most of a fresh page, and a spinner on
 *   each of them would turn "open a page" into a loading screen for content
 *   that does not exist.
 *
 * `Loading` brings its own ~120ms delay-before-show, which is what keeps the
 * happy path invisible: a doc that arrives promptly unmounts this before it
 * ever paints.
 */
export function HydrationPlaceholder({
  block,
  doc,
  textVariant,
}: {
  block: Block;
  doc: CollabBlockDoc;
  textVariant: BlockTextVariant;
}) {
  const { everRendered, hydration, rehydrate } = doc;
  if (hydration.kind === "hydrated") return null;

  if (hydration.kind === "stalled") {
    return (
      <Pin to="top-right">
        <Inset y="xs">
          <ControlSizeProvider size="xs">
            <Inline gap="xs">
              <Text variant="caption" tone="muted">
                Text didn&rsquo;t load
              </Text>
              <Button variant="outline" onClick={rehydrate}>
                Retry
              </Button>
            </Inline>
          </ControlSizeProvider>
        </Inset>
      </Pin>
    );
  }

  // Never a loading state over text the user has already seen.
  if (everRendered) return null;

  const rowLength = runsLength(
    runsOf((block.data as Record<string, unknown> | null)?.text),
  );
  if (rowLength === 0) return null;
  const widthCh = Math.min(
    Math.max(rowLength, SKELETON_MIN_CH),
    SKELETON_MAX_CH,
  );
  return (
    // The block's own type scale, so the `ch`/`em` sizing below resolves against
    // the very line the text will land on; `decorative` keeps it click-through,
    // because the block underneath is still a live editing host.
    <Pin
      to="top-left"
      decorative
      aria-hidden
      className={TEXT_VARIANT_CLASS[textVariant]}
    >
      <Inset y="xs">
        <div style={{ width: `${widthCh}ch`, height: "1em" }}>
          <Loading variant="block" className="size-full opacity-60" />
        </div>
      </Inset>
    </Pin>
  );
}
