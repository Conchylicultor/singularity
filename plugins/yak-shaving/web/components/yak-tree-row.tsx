import { useConversation } from "@plugins/conversations/web";
import { CONV_STATUS_DOT } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import type { TreeNode } from "@plugins/primitives/plugins/tree/shared";
import { cn } from "@/lib/utils";
import type {
  YakShavingCategory,
  YakShavingNode,
} from "../../shared/resources";
import { yakShavingConversationPane } from "../panes";

type ConversationItem = Omit<YakShavingNode, "rank"> & {
  kind: "conversation";
  parentId: string | null;
  rank: string;
};

type CategoryItem = Omit<YakShavingCategory, "rank"> & {
  kind: "category";
  parentId: string | null;
  rank: string;
};

export type YakTreeItem = ConversationItem | CategoryItem;
export type YakTreeNode = TreeNode<YakTreeItem>;

const NODE_STATUS_DOT: Record<string, string> = {
  ready: "bg-emerald-500",
  blocked: "bg-red-500",
  working: "bg-blue-500",
};

export function YakTreeRow({
  node,
  depth,
  selectedConvId,
}: {
  node: YakTreeNode;
  depth: number;
  selectedConvId?: string;
}) {
  const renderChildren = node.children.map((child) => (
    <YakTreeRow
      key={child.id}
      node={child}
      depth={depth + 1}
      selectedConvId={selectedConvId}
    />
  ));

  if (node.kind === "category") {
    return (
      <>
        <div
          className="flex w-full items-start gap-2 py-1.5 pr-2"
          style={{ paddingLeft: depth * 16 + 8 }}
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-foreground truncate text-sm font-semibold uppercase tracking-wide">
              {node.title}
            </span>
            <span className="text-muted-foreground truncate text-xs">
              {node.description}
            </span>
          </span>
        </div>
        {renderChildren}
      </>
    );
  }

  return (
    <>
      <ConversationRowButton
        node={node}
        depth={depth}
        selectedConvId={selectedConvId}
      />
      {renderChildren}
    </>
  );
}

function ConversationRowButton({
  node,
  depth,
  selectedConvId,
}: {
  node: ConversationItem;
  depth: number;
  selectedConvId?: string;
}) {
  const conversation = useConversation(node.conversationId);
  const title = conversation?.title || "(untitled)";
  const convStatus = conversation?.status;
  const isSelected = node.conversationId === selectedConvId;

  const dotClass =
    (node.status && NODE_STATUS_DOT[node.status]) ||
    (convStatus && CONV_STATUS_DOT[convStatus]) ||
    "bg-muted-foreground/40";
  const dotLabel = node.status ?? convStatus ?? "unknown";

  return (
    <button
      type="button"
      onClick={() =>
        yakShavingConversationPane.open({ convId: node.conversationId })
      }
      className={cn(
        "hover:bg-accent flex w-full items-start gap-2 rounded py-1.5 pr-2 text-left",
        isSelected && "bg-accent",
      )}
      style={{ paddingLeft: depth * 16 + 8 }}
    >
      <span
        aria-label={dotLabel}
        title={dotLabel}
        className={cn("mt-1.5 size-2 shrink-0 rounded-full", dotClass)}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{title}</span>
        {node.oneLineContext && (
          <span className="text-muted-foreground truncate text-xs">
            {node.oneLineContext}
          </span>
        )}
        {node.nextAction && (
          <span className="text-muted-foreground/90 truncate text-xs italic">
            Next: {node.nextAction}
          </span>
        )}
      </span>
    </button>
  );
}
