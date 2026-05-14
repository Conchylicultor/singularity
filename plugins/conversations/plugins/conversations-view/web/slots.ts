import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { ComponentType } from "react";

export interface ViewContribution {
  id: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
  order?: number;
  component: ComponentType<ViewProps>;
}

export interface ViewProps {
  activeId: string | null;
  onNavigate: (id: string) => void;
  onCloseConversation: (id: string, e: React.MouseEvent) => Promise<void>;
}

export const ConversationsView = {
  View: defineSlot<ViewContribution>("conversations-view.view", {
    docLabel: (p) => p.title,
  }),
};
