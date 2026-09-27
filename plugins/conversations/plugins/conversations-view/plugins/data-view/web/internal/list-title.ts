import {
  conversationTitle,
  type ConversationItemConv,
  type ConvTitleOverride,
} from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";

/** The part of a task short-title row the resolution reads. */
export type ShortTitleRow = { shortTitle: string; sourceTitle: string };

/**
 * What a conversation-list row is named by, per the `titleMode` setting.
 *
 * `short` takes the short title only while it was made from the task's CURRENT
 * title (`sourceTitle === conv.taskTitle`): a stale one — the task was renamed
 * and its short title is not regenerated yet — never reaches the screen. A short
 * title not known yet (loading, never generated, generation refused) shows the
 * full task title, which is a true name for the row, not a stand-in for data.
 */
export function resolveListTitle(
  mode: string,
  conv: ConversationItemConv & { taskTitle: string },
  short: ShortTitleRow | null,
): ConvTitleOverride {
  switch (mode) {
    case "conversation": {
      const title = conversationTitle(conv);
      return { label: title, full: title };
    }
    case "task":
      return { label: conv.taskTitle, full: conv.taskTitle };
    case "short":
      return {
        label:
          short !== null && short.sourceTitle === conv.taskTitle
            ? short.shortTitle
            : conv.taskTitle,
        full: conv.taskTitle,
      };
    default:
      // The config schema only admits the three values above.
      throw new Error(`Unknown conversation list titleMode: ${mode}`);
  }
}
