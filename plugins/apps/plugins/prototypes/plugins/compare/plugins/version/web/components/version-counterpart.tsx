import type { ReactElement, ReactNode } from "react";
import {
  matchResource,
  useCombinedResources,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import {
  prototypeHistoryResource,
  prototypesVersionResource,
  type PrototypeHistory,
  type PrototypeMeta,
  type PrototypeVersion,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import { usePrototypeDocumentSrc } from "@plugins/apps/plugins/prototypes/plugins/gallery/web";
import {
  MockFrame,
  type CounterpartKindProps,
  type CounterpartResolution,
} from "@plugins/apps/plugins/prototypes/plugins/compare/web";

/** The ref naming the live folder — the newest state of the prototype. */
const LATEST = "latest";

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
          const found = findVersion(history, target);
          if (found === undefined) {
            return children({
              status: "unresolved",
              title: (
                <>
                  This prototype has no version <Badge mono>{target}</Badge>.
                </>
              ),
              detail: `A version is named by its sha, or "${LATEST}" for the live folder.`,
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
