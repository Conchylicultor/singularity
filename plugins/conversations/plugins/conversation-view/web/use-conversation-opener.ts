import { useMemo } from "react";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "./panes";

/**
 * How a surface opens a conversation, and how it knows which one it has open.
 *
 * Six surfaces render "a conversation you can click to open its run" — task
 * detail's attempts, the launched-attempts card in a transcript, an agent-note
 * card's authors, a TODO card's latest run, the `conv-<id>` token in prose, and
 * the shared chip. Each used to spell the navigation itself, so the pane mode,
 * the "is this the open one" rule and whether a second click closes the column
 * were four different answers to the same question. They are one here.
 */
export interface ConversationOpener {
  /** The conversation column this surface has open, or `null`. */
  openConvId: string | null;
  /** Is this the conversation this surface has open? */
  isOpen(convId: string): boolean;
  /**
   * Open this conversation beside the surface — or close it, when it is the one
   * already open. Opening a conversation is a toggle everywhere, so a row that
   * lights up when you open it also puts itself out when you click it again.
   */
  toggle(convId: string): void;
  /** Open this conversation as its own page, replacing the surface's route. */
  openAsPage(convId: string): void;
}

export function useConversationOpener(): ConversationOpener {
  const openPane = useOpenPane();
  // The conversation column THIS surface opened — the pane primitive's own
  // answer, rather than a guess made from the shape of the chain.
  const opened = conversationPane.useOpenedHere();

  return useMemo(() => {
    const openConvId = opened?.params.convId ?? null;
    return {
      openConvId,
      isOpen: (convId) => convId === openConvId,
      toggle: (convId) => {
        if (opened && convId === openConvId) {
          conversationPane.close(opened.instanceId);
          return;
        }
        openPane(conversationPane, { convId }, { mode: "push" });
      },
      openAsPage: (convId) => {
        openPane(conversationPane, { convId }, { mode: "root" });
      },
    } satisfies ConversationOpener;
  }, [opened, openPane]);
}
