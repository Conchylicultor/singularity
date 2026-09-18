import { useState, type ReactElement, type ReactNode } from "react";
import {
  matchResource,
  useCombinedResources,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import {
  prototypeHistoryResource,
  prototypesVersionResource,
  resolvePicks,
  type PrototypeHistory,
  type PrototypeMeta,
  type PrototypeVersion,
  type StoredPicks,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import {
  documentOptions,
  OptionRows,
  prototypeDocumentSrc,
  summarizePicks,
  usePrototypeDetail,
  usePrototypeDocumentSrc,
} from "@plugins/apps/plugins/prototypes/plugins/gallery/web";
import { InlinePopover } from "@plugins/primitives/plugins/overlay/plugins/popover/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  MockFrame,
  type CounterpartKindProps,
  type CounterpartResolution,
} from "@plugins/apps/plugins/prototypes/plugins/compare/web";

/** The ref naming the live folder — the newest state of the prototype. */
const LATEST = "latest";

/**
 * The ref naming the version on screen — the mock half's own document — with
 * option picks of its own: the same version as another variant.
 */
const SHOWN = "shown";

/**
 * The `version:` kind: another version of the same prototype — `version:latest`
 * (the live folder, reloading on every edit) or `version:<sha>` (a recorded
 * version, frozen).
 *
 * Framed exactly as the mock half is (`MockFrame`, at the prototype's declared
 * viewport), with the picks judged against THAT version's own options, so the
 * two halves differ by nothing but the version.
 */
export function VersionCounterpart({
  target,
  meta,
  children,
}: CounterpartKindProps): ReactElement {
  const gate = useCombinedResources({
    history: useResource(prototypeHistoryResource, { name: meta.name }),
    cacheBust: useResource(prototypesVersionResource),
  });
  return (
    <>
      {matchResource(gate, {
        pending: () =>
          children({ status: "loading", label: "Loading versions…" }),
        error: (err) =>
          children({
            status: "unresolved",
            title: "The prototype's version history is unavailable.",
            detail: err.message,
          }),
        ready: ({ history, cacheBust }) => {
          if (target === SHOWN) {
            return (
              <ShownVariant meta={meta} cacheBust={cacheBust}>
                {children}
              </ShownVariant>
            );
          }
          const found = findVersion(history, target);
          if (found === undefined) {
            return children({
              status: "unresolved",
              title: (
                <>
                  This prototype has no version <Badge mono>{target}</Badge>.
                </>
              ),
              detail: `A version is named by its sha, "${LATEST}" for the live folder, or "${SHOWN}" for the version on screen.`,
            });
          }
          return (
            <FoundVersion
              meta={meta}
              version={found}
              history={history}
              cacheBust={cacheBust}
            >
              {children}
            </FoundVersion>
          );
        },
      })}
    </>
  );
}

/**
 * The version `target` names: `null` for the live folder, `undefined` when the
 * history holds no such sha.
 */
function findVersion(
  history: PrototypeHistory,
  target: string,
): PrototypeVersion | null | undefined {
  if (target === LATEST) return null;
  return history.versions.find((v) => v.sha === target);
}

function FoundVersion({
  meta,
  version,
  history,
  cacheBust,
  children,
}: {
  meta: PrototypeMeta;
  version: PrototypeVersion | null;
  history: PrototypeHistory;
  cacheBust: number;
  children: (resolution: CounterpartResolution) => ReactNode;
}): ReactNode {
  const src = usePrototypeDocumentSrc(meta, version, cacheBust);
  if (src.pending) {
    return children({
      status: "loading",
      label: "Loading the picked options…",
    });
  }
  return children({
    status: "found",
    // Both halves are the same prototype, drawn at its declared width.
    widths: [meta.viewport.w],
    title: version === null ? "Latest version" : `Version ${String(version.n)}`,
    subtitle: version === null ? latestCaption(history) : version.subject,
    render: () => (
      <MockFrame meta={meta} src={src.data} height={meta.viewport.h} />
    ),
  });
}

/** What the live folder is, in the stepper's own words. */
function latestCaption(history: PrototypeHistory): string {
  const newest = history.versions.at(-1);
  if (history.dirty || newest === undefined) return "Live · unsaved";
  return `v${String(newest.n)} · Latest`;
}

/**
 * `version:shown` — the version on screen, beside itself as another variant.
 *
 * It follows the mock half's version (the stepper moves both), but its option
 * picks are its OWN, held here rather than in the prototype's shared record:
 * picking a variant for this half changes nothing any other surface shows, and
 * the pane's options picker keeps driving the mock half alone. They start as
 * the shared picks, so the two halves open identical and differ by whatever the
 * reader then changes; they are forgotten when the comparison is.
 */
function ShownVariant({
  meta,
  cacheBust,
  children,
}: {
  meta: PrototypeMeta;
  cacheBust: number;
  children: (resolution: CounterpartResolution) => ReactNode;
}): ReactNode {
  const { picks } = usePrototypeDetail();
  if (picks.pending) {
    return children({
      status: "loading",
      label: "Loading the picked options…",
    });
  }
  return (
    <HeldVariant meta={meta} cacheBust={cacheBust} initial={picks.data}>
      {children}
    </HeldVariant>
  );
}

/** {@link ShownVariant} once the shared picks are known to start from. */
function HeldVariant({
  meta,
  cacheBust,
  initial,
  children,
}: {
  meta: PrototypeMeta;
  cacheBust: number;
  initial: StoredPicks;
  children: (resolution: CounterpartResolution) => ReactNode;
}): ReactNode {
  const { shownVersion } = usePrototypeDetail();
  const [held, setHeld] = useState<StoredPicks>(initial);
  const options = documentOptions(meta, shownVersion);
  if (options.length === 0) {
    return children({
      status: "unresolved",
      title: "This version declares no options.",
      detail:
        'A variant is a value of a <meta name="prototype-option"> the page declares; with none, every variant is the same page.',
    });
  }
  const summary = summarizePicks(options, resolvePicks(options, held));
  return children({
    status: "found",
    widths: [meta.viewport.w],
    title: "Another variant",
    subtitle: summary,
    controls: (
      <InlinePopover
        trigger={<Button variant="outline">{`Variant: ${summary}`}</Button>}
      >
        <Stack direction="col" gap="md">
          <Text variant="caption" tone="muted">
            The right half only. The options picker drives the left.
          </Text>
          <OptionRows
            options={options}
            picks={resolvePicks(options, held)}
            onPick={(option, value) =>
              setHeld((h) => ({ ...h, [option]: value }))
            }
          />
        </Stack>
      </InlinePopover>
    ),
    render: () => (
      <MockFrame
        meta={meta}
        src={prototypeDocumentSrc(meta, shownVersion, cacheBust, held)}
        height={meta.viewport.h}
      />
    ),
  });
}
