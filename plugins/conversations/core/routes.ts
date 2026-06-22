import { defineRoute } from "@plugins/primitives/plugins/pane/core";

export const conversationRoute = defineRoute({ id: "conversation", segment: "c/:convId" });
