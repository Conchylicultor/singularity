import { Avatar, type SvgNode } from "@plugins/primitives/plugins/avatar/web";
import {
  CONV_STATUS_DOT,
  type ConversationItemConv,
} from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { useCategoryFor } from "../internal/use-category";
import { useCategoryColors } from "../internal/use-category-colors";
import { autoColorKey } from "../internal/colors";

function parseSvgNodes(raw: string | null | undefined): SvgNode[] | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as SvgNode[]; } catch { return null; }
}

export function CategoryAvatarRow({ conv }: { conv: ConversationItemConv }) {
  const category = useCategoryFor(conv.id);
  const overrides = useCategoryColors();
  const override = category ? overrides[category] : undefined;
  const autoColor = category ? autoColorKey(category) : undefined;

  return (
    <Avatar
      icon={override?.iconKey ?? null}
      color={override?.colorKey ?? autoColor ?? null}
      svgNodes={parseSvgNodes(override?.iconSvgNodes)}
      size="sm"
      statusDot={CONV_STATUS_DOT[conv.status]}
      fallbackKey={category ?? conv.id}
    />
  );
}
