import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import {
  ConversationProvide,
  conversationPane,
} from "@plugins/conversations/plugins/conversation-view/web";
import { JsonlPane } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { statsPane } from "@plugins/stats/web";

export const costConvSidePane = Pane.define({
  id: "stats-cost-conv-side",
  after: [statsPane],
  segment: "c/:sideConvId",
  component: CostConvSideBody,
  chrome: {
    history: false,
    expand: ({ sideConvId }) => `/c/${sideConvId}`,
  },
});

function CostConvSideBody() {
  const { sideConvId } = costConvSidePane.useParams();
  // ConversationProvide loads the record and sets up `conversationPane.Provider`,
  // which the JsonlPane row renderers need (they call `conversationPane.useData()`).
  return (
    <ConversationProvide convId={sideConvId}>
      <CostConvSideInner />
    </ConversationProvide>
  );
}

function CostConvSideInner() {
  const { conversation } = conversationPane.useData();
  return (
    <PaneChrome
      pane={costConvSidePane}
      title={conversation.title ?? conversation.id}
    >
      <div className="h-full min-h-0 overflow-hidden">
        <JsonlPane conversation={conversation} />
      </div>
    </PaneChrome>
  );
}
