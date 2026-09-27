import { defineConfig } from "@plugins/config_v2/core";
import { enumField } from "@plugins/fields/plugins/enum/plugins/config/core";

export const conversationListConfig = defineConfig({
  fields: {
    titleMode: enumField({
      options: [
        { value: "conversation", label: "Conversation title" },
        { value: "task", label: "Task title" },
        { value: "short", label: "Short task title" },
      ],
      default: "conversation",
      label: "Conversation list title",
      description:
        "What each row of the conversations list (Queue and History) is named by: the conversation's own title, its task's full title, or a short (at most three words) version of the task title. Hovering a row always shows the full title. Chips and every other place that names a conversation keep the conversation title.",
    }),
  },
});
