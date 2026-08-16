import {
  matchResource,
  useCombinedResources,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { PaneChrome, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import {
  Inset,
  Stack,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { MdWarning } from "react-icons/md";
import {
  prototypesResource,
  prototypesVersionResource,
  type PrototypeMeta,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import { prototypeDetailPane } from "../panes";
import { PrototypeDetailProvider, usePrototypeDetail } from "../context";
import { ScaledIframe } from "./scaled-iframe";

/**
 * The detail pane. Its header controls (Focus/Compare, Present, Improve) are
 * NOT rendered here — they are contributions to `prototypeDetailPane.Actions`,
 * so the pane's own header IS the action bar and any plugin can add to it. The
 * shared state those controls read lives in {@link PrototypeDetailProvider},
 * which wraps `PaneChrome` (the header renders inside it).
 */
export function PrototypeDetail() {
  const { name } = prototypeDetailPane.useParams();
  return (
    <PrototypeDetailProvider name={name}>
      <PaneChrome pane={prototypeDetailPane} title={name}>
        <PrototypeStage />
      </PaneChrome>
    </PrototypeDetailProvider>
  );
}

function PrototypeStage() {
  const { name, mode } = usePrototypeDetail();
  const listResult = useResource(prototypesResource);
  const versionResult = useResource(prototypesVersionResource);
  // Gate list + version together: the stage never renders from a half-loaded
  // snapshot, and `version` (the iframe cache-bust) arrives as a real number.
  const stage = useCombinedResources({
    rows: listResult,
    version: versionResult,
  });
  const openPane = useOpenPane();

  return matchResource(stage, {
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
      return mode === "focus" ? (
        <Column
          className="h-full"
          header={<ProblemBanner meta={meta} />}
          body={<ScaledIframe meta={meta} version={version} />}
          scrollBody={false}
        />
      ) : (
        <CompareGrid
          rows={rows}
          version={version}
          onPick={(picked) =>
            openPane(prototypeDetailPane, { name: picked }, { mode: "swap" })
          }
        />
      );
    },
  });
}

/**
 * What is wrong with this prototype's folder, above the prototype itself.
 *
 * Prototypes are user content in `~/.singularity/prototypes/`, not code, so the
 * self-contained contract can't be enforced by a push-time check any more. It is
 * enforced when the folder is read, and reported here — in front of the person
 * who just wrote it, next to the thing that isn't rendering right.
 */
function ProblemBanner({ meta }: { meta: PrototypeMeta }) {
  if (meta.problems.length === 0) return null;
  return (
    <Inset pad="sm">
      <Stack direction="col" gap="2xs">
        <Badge variant="warning" icon={<MdWarning />}>
          {meta.problems.length === 1
            ? "1 problem with this folder"
            : `${meta.problems.length} problems with this folder`}
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

/**
 * A horizontally-scrolling row of scaled live iframes, one per prototype. Each
 * is labeled and clickable — clicking switches Focus to that prototype.
 */
function CompareGrid({
  rows,
  version,
  onPick,
}: {
  rows: PrototypeMeta[];
  version: number;
  onPick: (name: string) => void;
}) {
  return (
    <div
      className="h-full w-full"
      style={{
        display: "flex",
        gap: "1rem",
        overflowX: "auto",
        padding: "1rem",
      }}
    >
      {rows.map((meta) => (
        <div
          key={meta.name}
          style={{
            display: "flex",
            flexDirection: "column",
            flex: "0 0 360px",
            minWidth: 0,
            height: "100%",
          }}
        >
          <button
            type="button"
            onClick={() => onPick(meta.name)}
            className="rounded-md border text-left"
            style={{ flex: "1 1 auto", minHeight: 0, overflow: "hidden" }}
          >
            <ScaledIframe meta={meta} version={version} />
          </button>
          <Text as="div" variant="caption" tone="muted" className="pt-xs">
            {meta.title}
          </Text>
        </div>
      ))}
    </div>
  );
}
