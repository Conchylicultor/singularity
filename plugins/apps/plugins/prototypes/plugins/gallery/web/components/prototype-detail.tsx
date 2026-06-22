import { useState } from "react";
import { MdAutoAwesome } from "react-icons/md";
import {
  matchResource,
  useCombinedResources,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { PaneChrome, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { SegmentedControl } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { LaunchAgentPopover } from "@plugins/primitives/plugins/launch/web";
import { toast } from "@plugins/shell/plugins/notifications/web";
import { conversationRoute } from "@plugins/conversations/core";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import {
  prototypesResource,
  prototypesVersionResource,
  type PrototypeMeta,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import { prototypeDetailPane } from "../panes";
import { ScaledIframe } from "./scaled-iframe";

type Mode = "focus" | "compare";

const MODE_OPTIONS = [
  { id: "focus" as const, label: "Focus" },
  { id: "compare" as const, label: "Compare" },
];

function improveText(name: string): string {
  return [
    `Iterate on the \`${name}\` UI prototype.`,
    "",
    `Edit the files under \`prototypes/${name}/\` (\`app.jsx\` / \`styles.css\` /`,
    "`meta.json`). The open iframe auto-reloads on save.",
  ].join("\n");
}

export function PrototypeDetail() {
  const { name } = prototypeDetailPane.useParams();
  const listResult = useResource(prototypesResource);
  const versionResult = useResource(prototypesVersionResource);
  // Gate list + version together: the stage never renders from a half-loaded
  // snapshot, and `version` (the iframe cache-bust) arrives as a real number.
  const stage = useCombinedResources({
    rows: listResult,
    version: versionResult,
  });
  const [mode, setMode] = useState<Mode>("focus");
  const openPane = useOpenPane();

  const improveButton = (
    <LaunchAgentPopover
      trigger={
        <Button variant="outline">
          <MdAutoAwesome />
          Improve this prototype
        </Button>
      }
      title="Improve prototype"
      description={`Launch an agent to iterate on the ${name} prototype.`}
      placeholder="What should change? (optional)"
      align="end"
      onLaunched={(conv) => {
        toast({
          type: "prototype",
          title: "Improving prototype",
          description: "Agent launched in the background — open it from here or the bell.",
          variant: "info",
          linkTo: conversationRoute.link(agentManagerApp, { convId: conv.id }),
        });
      }}
      getRequest={(userText) => {
        const parts = [improveText(name)];
        if (userText.trim()) parts.push(`Additional context: ${userText.trim()}`);
        return { prompt: parts.join("\n\n") };
      }}
    />
  );

  return (
    <PaneChrome pane={prototypeDetailPane} title={name}>
      {matchResource(stage, {
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
            // Header + filling stage. Inline styles for the structural column
            // (not className layout utilities, which `no-adhoc-layout` bans).
            <div
              className="h-full w-full"
              style={{ display: "flex", flexDirection: "column", minHeight: 0 }}
            >
              <div
                className="border-b p-sm"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <SegmentedControl<Mode>
                  options={MODE_OPTIONS}
                  value={mode}
                  onChange={setMode}
                />
                {improveButton}
              </div>
              <div style={{ flex: "1 1 auto", minHeight: 0 }}>
                {mode === "focus" ? (
                  <ScaledIframe meta={meta} version={version} />
                ) : (
                  <CompareGrid
                    rows={rows}
                    version={version}
                    onPick={(picked) =>
                      openPane(
                        prototypeDetailPane,
                        { name: picked },
                        { mode: "swap" },
                      )
                    }
                  />
                )}
              </div>
            </div>
          );
        },
      })}
    </PaneChrome>
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
      style={{ display: "flex", gap: "1rem", overflowX: "auto", padding: "1rem" }}
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
            {meta.name}
          </Text>
        </div>
      ))}
    </div>
  );
}
