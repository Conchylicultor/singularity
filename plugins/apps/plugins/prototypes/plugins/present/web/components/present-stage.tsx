import {
  matchResource,
  useCombinedResources,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { hoverRevealTarget } from "@plugins/primitives/plugins/hover-reveal/web";
import {
  prototypesResource,
  prototypesVersionResource,
  type PrototypeMeta,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import {
  FrameSizeProvider,
  OptionsPicker,
  ScaledIframe,
  useFrameSizeState,
  usePrototypeSrc,
} from "@plugins/apps/plugins/prototypes/plugins/gallery/web";

/**
 * What every presentation shows — the three in-app overlays and the new-tab
 * page alike, so they cannot drift: the prototype scaled up to fill its box,
 * with the options picker floating in the bottom-right corner.
 *
 * Renders inside a `PrototypeDetailProvider` (the picks and the shown version
 * come from there) and inside a positioned `hoverRevealGroup` box the caller
 * owns — the box is where the caller's own chrome (the overlay's ×) pins too.
 */
export function PresentStage({ name }: { name: string }) {
  const stage = useCombinedResources({
    rows: useResource(prototypesResource),
    version: useResource(prototypesVersionResource),
  });
  return matchResource(stage, {
    pending: () => <Loading variant="block" />,
    error: () => <Loading variant="block" />,
    ready: ({ rows, version }) => {
      const meta = rows.find((p) => p.name === name) ?? null;
      if (!meta) {
        return (
          <Text as="div" variant="body" tone="muted">
            Prototype not found.
          </Text>
        );
      }
      return <PresentedFrame meta={meta} version={version} />;
    },
  });
}

/**
 * The presented prototype, on the variant the pane is showing: the same
 * `usePrototypeSrc` URL as Focus and Compare, so presenting never drops the
 * reader's picks — and, like them, it waits for the picks rather than opening
 * on the defaults.
 *
 * The options picker comes along, in the corner it has in the pane, so a theme
 * or variant can still be switched while presenting — there is no pane header
 * to go back to. It is inline DOM (no portal), so it stays inside a
 * fullscreened subtree. Revealed on hover: at rest the presentation shows only
 * the design. It draws nothing while the picks are unknown, which is the same
 * wait the frame is in.
 *
 * **Presenting opens at Full size**: the frame fills the presentation and the
 * page's own responsive layout shows, rather than a fixed canvas scaled up.
 * The size is the presentation's own (a nested frame-size scope), so the
 * picker's Size row can still switch to Fixed or Mobile here without changing
 * the size the pane was left on.
 */
function PresentedFrame({
  meta,
  version,
}: {
  meta: PrototypeMeta;
  version: number;
}) {
  const src = usePrototypeSrc(meta, version);
  const frameSize = useFrameSizeState("full");
  return (
    <FrameSizeProvider value={frameSize}>
      {/* No `error` arm: a picks record that cannot be read stays broken until
          someone fixes it, so it renders as the default error placeholder (its
          message) rather than as a spinner that never ends. */}
      {matchResource(src, {
        pending: () => <Loading variant="block" />,
        ready: (url) => (
          <ScaledIframe meta={meta} src={url} size={frameSize.size} upscale />
        ),
      })}
      <Pin to="bottom-right" offset="md" className={hoverRevealTarget}>
        <OptionsPicker meta={meta} withVersion />
      </Pin>
    </FrameSizeProvider>
  );
}
