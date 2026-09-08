import { Fragment, type ReactNode } from "react";
import { MdAutoMode, MdBolt, MdExitToApp, MdMap } from "react-icons/md";
import { EventLine } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import type { AttachmentRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/core";
import { FilePath } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/file-path/web";

/** Auto mode injects no prose of its own — the switches ARE the fact, so the
 *  row reads them straight off the payload rather than off a fixed field. */
interface AutoModePayload {
  type: "auto_mode";
  [flag: string]: unknown;
}

interface PlanModePayload {
  type: "plan_mode" | "plan_mode_exit";
  planFilePath?: string;
  planExists?: boolean;
  isSubAgent?: boolean;
}

/** A few switch names don't state a fact on their own — `bypass` alone reads as
 *  a verb with no object. Glossed here rather than filtered, so an unglossed
 *  new switch still shows up under its humanised name. */
const FLAG_GLOSS: Record<string, string> = {
  bypass: "bypass permissions",
};

/** `bashFirstSteer` → `bash first steer`. Switch names are the harness's
 *  identifiers; a reader wants words. */
function humaniseFlag(key: string): string {
  return (
    FLAG_GLOSS[key] ?? key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase()
  );
}

/**
 * The switches that are ON, in the order the harness wrote them. Booleans
 * contribute their name; a non-boolean setting (`bashFirstSteer: "strict"`)
 * carries a value a reader needs, so it contributes `name: value`. Reading the
 * payload's own keys means a switch added upstream appears here without this
 * plugin changing.
 */
function activeSwitches(payload: AutoModePayload): string[] {
  return Object.entries(payload).flatMap(([key, value]) => {
    if (key === "type") return [];
    if (value === true) return [humaniseFlag(key)];
    if (typeof value === "string" && value) {
      return [`${humaniseFlag(key)}: ${value}`];
    }
    return [];
  });
}

/** Interleave a muted `·` so adjacent glosses read as separate facts instead of
 *  one run-on phrase. */
function Separated({ parts }: { parts: ReactNode[] }) {
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 && <span className="text-muted-foreground/50">·</span>}
          {part}
        </Fragment>
      ))}
    </>
  );
}

/**
 * The plan file is the one thing a reader can act on; whether a plan was
 * actually written is the other half of the same sentence. Returns nothing at
 * all when the payload names neither, so the row is the bare label rather than
 * a label trailing off into an empty space.
 */
function planDetail(payload: PlanModePayload): ReactNode {
  const parts: ReactNode[] = [];
  if (payload.planFilePath) {
    parts.push(<FilePath filePath={payload.planFilePath} />);
  }
  if (payload.planExists === false)
    parts.push(<span>no plan written yet</span>);
  if (payload.isSubAgent) parts.push(<span>subagent</span>);
  return parts.length > 0 ? <Separated parts={parts} /> : undefined;
}

/**
 * The rules the session runs under from this point on: auto mode and its
 * switches, entering and leaving plan mode, and ultracode. Four spellings of
 * one fact — *the agent is operating under a different contract now* — so they
 * share a component and differ only in label, icon and the one value each has
 * worth naming.
 *
 * All four are one-liners. None of them carries content to inspect: auto mode
 * is a handful of switches, plan mode is a path, ultracode is a stance. A card
 * whose body only restated its label would be noise in a timeline the reader is
 * scrolling past.
 */
export function SessionModeView({ event }: AttachmentRendererProps) {
  switch (event.subtype) {
    case "auto_mode": {
      const active = activeSwitches(event.attachment as AutoModePayload);
      return (
        <EventLine icon={<MdAutoMode className="size-3.5" />} label="Auto mode">
          <span className="truncate">
            {active.length > 0 ? active.join(" · ") : "all switches off"}
          </span>
        </EventLine>
      );
    }
    case "plan_mode":
      return (
        <EventLine icon={<MdMap className="size-3.5" />} label="Plan mode">
          {planDetail(event.attachment as PlanModePayload)}
        </EventLine>
      );
    case "plan_mode_exit":
      return (
        <EventLine
          icon={<MdExitToApp className="size-3.5" />}
          label="Plan mode exited"
        >
          {planDetail(event.attachment as PlanModePayload)}
        </EventLine>
      );
    case "ultra_effort_enter":
      return (
        <EventLine icon={<MdBolt className="size-3.5" />} label="Ultracode on">
          <span className="truncate">exhaustive over fast</span>
        </EventLine>
      );
    default:
      throw new Error(`session-mode has no reading for "${event.subtype}"`);
  }
}
