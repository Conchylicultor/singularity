import {
  matchResource,
  useCombinedResources,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import {
  prototypesResource,
  prototypesVersionResource,
  type PrototypeMeta,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import { prototypeDetailPane } from "../panes";
import {
  PrototypeDetailProvider,
  usePrototypeDetail,
  usePrototypeSrc,
  type PrototypeStage,
} from "../context";
import { PrototypeStages } from "../slots";
import { FrameSizeProvider } from "../frame-size";
import { OptionsPicker } from "./options-picker";
import { PastVersionPill } from "./past-version-pill";

/**
 * The detail pane. Its header controls (the stage switcher, Present, Improve)
 * are NOT rendered here — they are contributions to
 * `prototypeDetailPane.Actions`, so the pane's own header IS the action bar and
 * any plugin can add to it. The shared state those controls read lives in
 * {@link PrototypeDetailProvider}, which wraps `PaneChrome` (the header renders
 * inside it). The picked stage is the URL's optional `:stage` — read here and
 * written back in place, so switching stage changes the address without
 * remounting the pane.
 */
export function PrototypeDetail() {
  const { name, stage } = prototypeDetailPane.useParams();
  const setParams = prototypeDetailPane.useSetParams();
  return (
    <PrototypeDetailProvider
      name={name}
      stageId={stage}
      onStageChange={(id) => setParams({ name, stage: id })}
    >
      <PaneChrome
        pane={prototypeDetailPane}
        title={<PrototypeTitle name={name} />}
      >
        <StageBody />
      </PaneChrome>
    </PrototypeDetailProvider>
  );
}

/**
 * The pane's header name: the prototype's own `<title>`.
 *
 * NOT `name` — that is a minted id (`proto-1786877040-w2vi`), which says nothing
 * to a person. It has to be looked up in the live list, so this is a node rather
 * than a string, and each arm is rendered for what it actually is:
 *
 * - not loaded yet → the loading state. Painting the id here would be a
 *   stand-in for something unknown, and it would then swap under the reader.
 * - loaded, and there is no such folder → the id, monospaced. This is the one
 *   place the raw id belongs: the prototype has no title because it does not
 *   exist, and the address the URL asked for is the only true thing left to say
 *   (the body says "Prototype not found." right below it).
 * - the list itself failed → same, for the same reason: the title is genuinely
 *   unavailable, and the pane must not lose its identity over it.
 */
function PrototypeTitle({ name }: { name: string }) {
  const result = useResource(prototypesResource);
  const unknown = <span className="font-mono">{name}</span>;
  return matchResource(result, {
    pending: () => <Loading variant="text" />,
    error: () => unknown,
    ready: (rows) => {
      const meta = rows.find((p) => p.name === name);
      return meta ? <>{meta.title}</> : unknown;
    },
  });
}

/**
 * The pane body: whichever stage the header switcher has active.
 *
 * The resources are resolved HERE, once, for two reasons — the pane owes the
 * "Prototype not found" answer whatever stage is up, and a stage that read them
 * itself would re-render the whole gate on every switch. What a stage gets is
 * {@link PrototypeStageProps}; which stage that is, this file does not know.
 */
function StageBody() {
  const { name, stage } = usePrototypeDetail();
  const listResult = useResource(prototypesResource);
  const versionResult = useResource(prototypesVersionResource);
  // Gate list + version together: the stage never renders from a half-loaded
  // snapshot, and `version` (the iframe cache-bust) arrives as a real number.
  const gate = useCombinedResources({
    rows: listResult,
    version: versionResult,
  });

  return matchResource(gate, {
    pending: () => <Loading variant="block" />,
    error: () => <Loading variant="block" />,
    ready: ({ rows, version }) => {
      const meta = rows.find((p) => p.name === name) ?? null;
      if (!meta) {
        return (
          <Text as="div" variant="body" tone="muted" className="p-lg">
            Prototype not found.
          </Text>
        );
      }
      if (!stage) {
        return (
          <Text as="div" variant="body" tone="muted" className="p-lg">
            No stage is contributed for this pane.
          </Text>
        );
      }
      return (
        <ReadyStage
          meta={meta}
          gallery={rows}
          version={version}
          stage={stage}
        />
      );
    },
  });
}

/**
 * The resolved stage, with the options picker floating over it when the
 * document on screen declares any. The picker sits at the PANE level, not in a
 * stage, so every stage shows the same variant under the same control.
 *
 * While a recorded version is shown the picker offers THAT version's options
 * (not today's, which may not exist in it), and the past-version pill
 * (Restore / Back to latest) sits under it in the same corner — over the stage
 * rather than in the header, so the header's width never changes as you step.
 *
 * `src` is built once here (`usePrototypeSrc`) and handed down whole: a stage
 * never composes a frame URL, so none can drop the picks, the cache-bust or
 * the shown version.
 *
 * The last part of the body's loading gate: the stage waits for the user's
 * picks, as it waits for the list and the version above, so a frame never
 * opens on the defaults and then swaps to the variant the user picked. Gated
 * HERE rather than beside the list, because the picks exist only for a
 * prototype that does — "Prototype not found" must not wait on them.
 */
function ReadyStage({
  meta,
  gallery,
  version,
  stage,
}: {
  meta: PrototypeMeta;
  gallery: PrototypeMeta[];
  version: number;
  stage: PrototypeStage;
}) {
  const { frameSize } = usePrototypeDetail();
  // No `error` arm: a picks record that cannot be read (a malformed
  // `_picks/<id>.json`) stays broken until someone fixes it, so it renders as
  // the default error placeholder naming the problem — never as a spinner
  // that never ends.
  return matchResource(usePrototypeSrc(meta, version), {
    pending: () => <Loading variant="block" />,
    ready: (src) => {
      const body = (
        // The positioning context the picker pins to.
        <div className="relative h-full">
          {renderIsolated(
            PrototypeStages.Stage,
            stage as unknown as Contribution,
            { meta, gallery, src },
          )}
          {/* One corner, stacked: the options picker, and under it — on a
            recorded version — what that version is, with Restore and Back to
            latest. The picker opens upward, so it never covers the pill. Each
            renders nothing when it has nothing to say. */}
          <Pin to="bottom-right" offset="md">
            <Stack direction="col" gap="sm" align="end">
              <OptionsPicker meta={meta} />
              <PastVersionPill />
            </Stack>
          </Pin>
        </div>
      );
      // The frame size reaches only a stage that renders through it — so the
      // picker's Size row, which reads the same scope, shows only there.
      return stage.usesFrameSize ? (
        <FrameSizeProvider value={frameSize}>{body}</FrameSizeProvider>
      ) : (
        body
      );
    },
  });
}
