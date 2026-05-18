import { defineTabbedView } from "@plugins/primitives/plugins/tabbed-view/web";

export interface ViewProps {
  activeId: string | null;
  onNavigate: (id: string) => void;
  onCloseConversation: (id: string, e: React.MouseEvent) => Promise<void>;
}

export const ConversationsView = defineTabbedView<ViewProps>(
  "conversations-view",
);
