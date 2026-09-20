import type { IconType } from "react-icons";
import {
  MdArticle,
  MdErrorOutline,
  MdHistory,
  MdVisibility,
} from "react-icons/md";
import type { BadgeVariant } from "@plugins/primitives/plugins/css/plugins/badge/core";
import type { SubagentRunState } from "../../core";

export interface SubagentStateDisplay {
  /** Sentence case — the jsonl-viewer bans all-caps and Title Case labels. */
  label: string;
  /** What the control that opens its transcript says. */
  openLabel: string;
  icon: IconType;
  variant: BadgeVariant;
  /**
   * Whether the state needs saying out loud on a card.
   *
   * "Running" and "Finished" are already legible from the card's own chrome
   * (the dots, the report). "Ended without reporting" is not legible from
   * anything — it is the absence of a signal — so it is the one that must be
   * spelled out.
   */
  notable: boolean;
}

/**
 * The ONE display reading of a sub-agent's run state, so a card, a pane header
 * and a button cannot disagree about what a sub-agent is doing or what the
 * control next to it promises.
 */
export function subagentStateDisplay(
  state: SubagentRunState,
  { isError = false }: { isError?: boolean } = {},
): SubagentStateDisplay {
  switch (state.kind) {
    case "running":
      return {
        label: "Running",
        openLabel: "Watch",
        icon: MdVisibility,
        variant: "info",
        notable: false,
      };
    case "finished":
      return isError
        ? {
            label: "Failed",
            openLabel: "View error",
            icon: MdErrorOutline,
            variant: "destructive",
            notable: false,
          }
        : {
            label: "Finished",
            openLabel: "View report",
            icon: MdArticle,
            variant: "success",
            notable: false,
          };
    case "ended-without-reporting":
      return {
        label: "Ended without reporting",
        openLabel: "View transcript",
        icon: MdHistory,
        variant: "warning",
        notable: true,
      };
  }
}
