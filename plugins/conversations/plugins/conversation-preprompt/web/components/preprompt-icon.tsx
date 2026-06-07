import { createElement } from "react";
import type { ReactNode } from "react";
import { MdCampaign } from "react-icons/md";
import { cn } from "@/lib/utils";
import { usePreprompt } from "@plugins/conversations/plugins/preprompts/web";
import type {
  ConversationPreprompt,
  PrepromptIcon as PrepromptIconSpec,
} from "../../shared";

type SvgNode = NonNullable<NonNullable<PrepromptIconSpec>["svgNodes"]>[number];

function renderSvgNodes(nodes: SvgNode[]): ReactNode {
  return nodes.map((node, i) =>
    createElement(
      node.tag,
      { key: i, ...node.attr },
      node.child.length > 0 ? renderSvgNodes(node.child) : undefined,
    ),
  );
}

// Renders a preprompt's icon as a bare, muted glyph. The icon is resolved
// *live* from the preprompt library by id — so an icon added or edited after
// launch shows immediately — and falls back to the launch-time snapshot when
// the library item was deleted (or edited to drop its icon). When neither
// carries an icon, a default glyph (MdCampaign) renders so a conversation with
// a preprompt is *always* visibly marked. The picked colour is intentionally
// dropped: markers read as neutral status (like the op-status build/push
// glyphs), not as a coloured label.
export function PrepromptIcon({
  record,
  className,
}: {
  record: ConversationPreprompt;
  className?: string;
}) {
  const live = usePreprompt(record.prepromptId);
  const nodes = (live?.icon ?? record.icon)?.svgNodes;
  if (!nodes?.length) {
    return <MdCampaign aria-hidden className={cn("size-3.5", className)} />;
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={cn("size-3.5", className)}
    >
      {renderSvgNodes(nodes)}
    </svg>
  );
}
