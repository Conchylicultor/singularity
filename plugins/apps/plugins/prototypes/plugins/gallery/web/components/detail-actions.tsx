import { MdAutoAwesome } from "react-icons/md";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { SegmentedControl } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { LaunchAgentPopover } from "@plugins/primitives/plugins/launch/web";
import { toast } from "@plugins/shell/plugins/notifications/web";
import { PROTOTYPES_DIR_DISPLAY } from "@plugins/infra/plugins/paths/plugins/display/core";
import { conversationRoute } from "@plugins/conversations/core";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { usePrototypeDetail, type PrototypeViewMode } from "../context";

/**
 * The detail pane's header controls, each a zero-prop contribution to
 * `prototypeDetailPane.Actions` — the standard pane extension point, so any
 * plugin can add a control beside these without this file changing (the
 * Present menu is one such contribution, from a sibling plugin).
 */

const MODE_OPTIONS = [
  { id: "focus" as const, label: "Focus" },
  { id: "compare" as const, label: "Compare" },
];

/** Focus | Compare — picks which stage the pane body paints. */
export function ViewModeSwitcher() {
  const { mode, setMode } = usePrototypeDetail();
  return (
    <SegmentedControl<PrototypeViewMode>
      options={MODE_OPTIONS}
      value={mode}
      onChange={setMode}
    />
  );
}

// The prompt every "Improve this prototype" agent starts from. It names exactly
// one folder: an iterating agent has no more reason to read a sibling prototype
// than a fresh one does, and this is the only instruction guaranteed to reach it.
//
// `name` is a minted id, not a name, so it is spelled as a PATH throughout —
// "iterate on the `proto-1786877040-w2vi` prototype" reads like a title the
// agent should live up to, when it is just an address. What the prototype is
// called is its `<title>`, which the agent reads out of the file it opens.
function improveText(name: string): string {
  return [
    `Iterate on the UI prototype in \`${PROTOTYPES_DIR_DISPLAY}/${name}/\`.`,
    "",
    "Edit the files in that folder and nothing else. That directory is not in the",
    "repo: edit in place and commit nothing. Do not rename the folder — its name",
    "is a minted id, and the prototype's own name is its `<title>`. Do not open",
    "any other prototype's folder. Saving reloads the open iframe automatically.",
    "",
    "Keep it self-contained: flat files referenced relatively, JSX inline, and it",
    "must still render when double-clicked straight off disk (`file://`).",
    "`prototypes/CLAUDE.md` is the full contract.",
  ].join("\n");
}

/** Launches an agent to iterate on the open prototype. */
export function ImproveButton() {
  const { name } = usePrototypeDetail();
  return (
    <LaunchAgentPopover
      trigger={
        <Button variant="outline">
          <MdAutoAwesome />
          Improve
        </Button>
      }
      title="Improve prototype"
      description="Launch an agent to iterate on the open prototype."
      placeholder="What should change? (optional)"
      align="end"
      onLaunched={(conv) => {
        toast({
          type: "prototype",
          title: "Improving prototype",
          description:
            "Agent launched in the background — open it from here or the bell.",
          variant: "info",
          linkTo: conversationRoute.link(agentManagerApp, { convId: conv.id }),
        });
      }}
      getRequest={(userText) => {
        const parts = [improveText(name)];
        if (userText.trim())
          parts.push(`Additional context: ${userText.trim()}`);
        return { prompt: parts.join("\n\n") };
      }}
    />
  );
}
