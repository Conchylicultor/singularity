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
 * prototype declares any. The picker sits at the PANE level, not in a stage, so
 * every stage shows the same variant under the same control.
 *
 * While a recorded version is shown the picker is gone: that version renders
 * as it was saved, at its own defaults, and the options declared TODAY may not
 * exist in it — a chip there would pick nothing. Its corner then holds the
 * past-version pill (Restore / Back to latest), which lives over the stage
 * rather than in the header so the header's width never changes as you step.
 *
 * `src` is built once here (`usePrototypeSrc`) and handed down whole: a stage
 * never composes a frame URL, so none can drop the picks, the cache-bust or
 * the shown version.
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
  const src = usePrototypeSrc(meta, version);
  const { shownVersion } = usePrototypeDetail();
  return (
    // The positioning context the picker pins to.
    <div className="relative h-full">
      {renderIsolated(PrototypeStages.Stage, stage as unknown as Contribution, {
        meta,
        gallery,
        src,
      })}
      {/* One corner, one occupant: the options picker on the live folder, or
          — on a recorded version, which has no picker — what that version is,
          with Restore and Back to latest. */}
      {shownVersion !== null ? (
        <Pin to="bottom-right" offset="md">
          <PastVersionPill />
        </Pin>
      ) : meta.options.length > 0 ? (
        <Pin to="bottom-right" offset="md">
          <OptionsPicker meta={meta} />
        </Pin>
      ) : null}
    </div>
  );
}
