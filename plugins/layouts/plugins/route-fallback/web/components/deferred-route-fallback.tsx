import { useDeferredLoadState } from "@plugins/framework/plugins/web-sdk/core";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";

/**
 * Loading placeholder for a pane route that currently matches nothing.
 *
 * WHY this exists: with deferred plugin loading, a cold deep-link into an app
 * (e.g. `/sonata/song/<id>`) paints the app shell + surface immediately, but the
 * route's actual *pane* belongs to a plugin that loads a beat later (post-paint,
 * deferred tier). During that gap the pane router matches nothing, so the layout
 * renderer has no pane to paint. Rendering blank there reads as a broken app; a
 * calm centered loader reads as "content is on its way".
 *
 * The gate is `deferredComplete`: we only show the loader **while the deferred
 * tier is still settling**. Once every deferred plugin has loaded (or failed),
 * an unmatched route is a genuinely-invalid URL — we return `null` so the caller
 * falls through to its existing not-found/blank behavior instead of spinning
 * forever.
 *
 * The `Loading` primitive has a built-in ~120ms delay-before-show, so a fast
 * deferred load unmounts this before it ever paints — no flash on the warm path.
 */
export function DeferredRouteFallback() {
  const { deferredComplete } = useDeferredLoadState();
  // Deferred tier settled → this is a real no-match, not a load gap. Defer to
  // the caller's prior empty behavior.
  if (deferredComplete) return null;
  return (
    <Center className="size-full">
      <Loading variant="spinner" label="Loading…" />
    </Center>
  );
}
