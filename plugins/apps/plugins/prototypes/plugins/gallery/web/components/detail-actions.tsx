import { MdAutoAwesome } from "react-icons/md";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { SegmentedControl } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { LaunchAgentPopover } from "@plugins/primitives/plugins/launch/web";
import { toast } from "@plugins/shell/plugins/notifications/web";
import { PROTOTYPES_DIR_DISPLAY } from "@plugins/infra/plugins/paths/plugins/display/core";
import { conversationRoute } from "@plugins/conversations/core";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  prototypeHistoryResource,
  prototypesResource,
  resolvePicks,
  type PrototypeHistory,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import { usePrototypeDetail } from "../context";
import { OPTIONS_RULE, pickedVariantLine } from "./launch-rules";

/**
 * The detail pane's header controls, each a zero-prop contribution to
 * `prototypeDetailPane.Actions` — the standard pane extension point, so any
 * plugin can add a control beside these without this file changing (the
 * Present menu is one such contribution, from a sibling plugin).
 */

/**
 * The stage picker — one chip per contributed stage, in the order the stages
 * declare. It names no stage: the options ARE the contributions, so a plugin
 * adding a stage adds a chip here without this file changing.
 */
export function StageSwitcher() {
  const { stages, stage, setStage } = usePrototypeDetail();
  if (stages.length < 2) return null;
  return (
    <SegmentedControl<string>
      options={stages.map((s) => ({ id: s.id, label: s.label }))}
      value={stage?.id ?? ""}
      onChange={setStage}
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
    "",
    "Every agent turn that changes the folder is recorded as a version. To see how",
    `the design got here, run \`./singularity prototype log ${name} -p\` — every past`,
    "version with its request and its diff.",
    "",
    OPTIONS_RULE,
  ].join("\n");
}

/**
 * The line saying which recorded version was on screen when Improve was
 * launched — "make this darker" may be about v3, not about the live folder.
 * Named by number and sha; by sha alone (which the restore command accepts
 * too) if the history no longer holds it.
 */
function shownVersionLine(
  name: string,
  sha: string,
  history: PrototypeHistory,
): string {
  const n = history.versions.find((v) => v.sha === sha)?.n;
  const which = n === undefined ? `version ${sha}` : `v${n} (${sha})`;
  const ref = n === undefined ? sha : `v${n}`;
  return [
    `The user was viewing ${which} when launching this, not the live folder —`,
    "they may want to build from that version;",
    `\`./singularity prototype restore ${name} ${ref}\` brings it back.`,
  ].join(" ");
}

/** Launches an agent to iterate on the open prototype. */
export function ImproveButton() {
  const { name, storedPicks, shownVersion } = usePrototypeDetail();
  const list = useResource(prototypesResource);
  const history = useResource(prototypeHistoryResource, { name });
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
      // Until the list is known there is no declaration to say which variant
      // is on screen against, so the launch waits for it — and likewise for the
      // history when a recorded version is on screen, to say which one.
      disabled={list.pending || (shownVersion !== null && history.pending)}
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
        // Which variant is on screen, so "make this darker" lands on the one
        // the user is looking at, resolved against the declaration as loaded.
        if (list.pending) {
          // Unreachable: the popover is disabled while the list loads.
          throw new Error(
            "the prototype list is still loading — cannot say which variant is on screen",
          );
        }
        if (shownVersion !== null) {
          // A past version renders at its own defaults, so there is no picked
          // variant to name — the version is what is on screen.
          if (history.pending) {
            // Unreachable: the popover is disabled while the history loads.
            throw new Error(
              "the prototype history is still loading — cannot say which version is on screen",
            );
          }
          parts.push(shownVersionLine(name, shownVersion, history.data));
        } else {
          const meta = list.data.find((p) => p.name === name);
          const variant = meta
            ? pickedVariantLine(resolvePicks(meta.options, storedPicks))
            : null;
          if (variant) parts.push(variant);
        }
        if (userText.trim())
          parts.push(`Additional context: ${userText.trim()}`);
        return { prompt: parts.join("\n\n") };
      }}
    />
  );
}
