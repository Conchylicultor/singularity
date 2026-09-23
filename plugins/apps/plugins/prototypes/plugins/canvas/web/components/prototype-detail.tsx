import type { ReactElement, ReactNode } from "react";
import { MdWarning } from "react-icons/md";
import {
  matchResource,
  useCombinedResources,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  Inset,
  Stack,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import {
  prototypesResource,
  prototypesVersionResource,
  type PrototypeMeta,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import { prototypeDetailPane } from "../panes";
import { PrototypeDetailProvider, usePrototypeDetail } from "../context";
import { Canvas } from "./canvas";

/**
 * The detail pane: the prototype's canvas of frames. Its header controls (copy
 * id, Done, the layout switch, the add buttons) are NOT rendered here — they
 * are contributions to `prototypeDetailPane.Actions`, so any plugin can add to
 * the header. The state they share lives in {@link PrototypeDetailProvider},
 * which wraps `PaneChrome` so the header renders inside it. The URL's coarse
 * layout is read when the canvas opens and written back in place.
 */
export function PrototypeDetail(): ReactElement {
  const { name, layout } = prototypeDetailPane.useParams();
  const setParams = prototypeDetailPane.useSetParams();
  return (
    <PrototypeDetailProvider
      name={name}
      layout={layout}
      onLayoutChange={(next) =>
        setParams(next === undefined ? { name } : { name, layout: next })
      }
    >
      <PaneChrome
        pane={prototypeDetailPane}
        title={<PrototypeTitle name={name} />}
      >
        <CanvasBody />
      </PaneChrome>
    </PrototypeDetailProvider>
  );
}

/**
 * The pane's header name: the prototype's own `<title>` — never `name`, a
 * minted id that says nothing to a person. Loading while the list is unknown;
 * the id, monospaced, only when there is no such folder (the one case it is the
 * only true thing left to say).
 */
function PrototypeTitle({ name }: { name: string }): ReactNode {
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
 * The pane body. The list and the version (the live frames' cache-bust) are
 * gated together, so the canvas never renders from a half-loaded snapshot.
 */
function CanvasBody(): ReactNode {
  const { name } = usePrototypeDetail();
  const gate = useCombinedResources({
    rows: useResource(prototypesResource),
    version: useResource(prototypesVersionResource),
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
      return (
        <Column
          className="h-full"
          header={<ProblemBanner meta={meta} />}
          body={<Canvas meta={meta} cacheBust={version} />}
          scrollBody={false}
        />
      );
    },
  });
}

/**
 * What is wrong with this prototype's folder, above the canvas. Prototypes are
 * user content, not code, so the self-contained contract is enforced when the
 * folder is read and reported here — in front of the person who just wrote it.
 */
function ProblemBanner({ meta }: { meta: PrototypeMeta }): ReactElement | null {
  if (meta.problems.length === 0) return null;
  return (
    <Inset pad="sm">
      <Stack direction="col" gap="2xs">
        <Badge variant="warning" icon={<MdWarning />}>
          {meta.problems.length === 1
            ? "1 problem with this folder"
            : `${String(meta.problems.length)} problems with this folder`}
        </Badge>
        {meta.problems.map((p) => (
          <Text
            key={`${p.path}:${p.detail}`}
            as="div"
            variant="caption"
            tone="muted"
          >
            {p.path === "" ? p.detail : `${p.path} — ${p.detail}`}
          </Text>
        ))}
      </Stack>
    </Inset>
  );
}
