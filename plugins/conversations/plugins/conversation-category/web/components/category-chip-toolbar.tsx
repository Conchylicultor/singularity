import { useState } from "react";
import { MdAutoAwesome, MdCheck } from "react-icons/md";
import { ConfigPopoverHeader } from "@plugins/config_v2/plugins/config-link/web";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import { Row } from "@plugins/primitives/plugins/row/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { toast } from "@plugins/notifications/web";
import { useConfig } from "@plugins/config_v2/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { conversationCategoryConfig } from "../../shared";
import { useCategoryFor } from "../internal/use-category";
import { colorClassFor } from "../internal/colors";
import { reclassify, setCategory } from "../internal/api";

export function CategoryChipToolbar() {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  const category = useCategoryFor(convId);
  const config = useConfig(conversationCategoryConfig);
  const categories = config.categories.map((c) => c.name);
  const [busy, setBusy] = useState<"classify" | "set" | null>(null);
  const [open, setOpen] = useState(false);
  if (!conversation) return null;
  if (conversation.kind === "agent") return null;

  const onPick = async (next: string) => {
    if (busy) return;
    setBusy("set");
    try {
      await setCategory(conversation.id, next);
      setOpen(false);
    } catch (err) {
      toast({
        type: "conversation",
        description: `Failed to set category: ${err instanceof Error ? err.message : String(err)}`,
        variant: "error",
      });
    } finally {
      setBusy(null);
    }
  };

  const onReclassify = async () => {
    if (busy) return;
    setBusy("classify");
    try {
      await reclassify(conversation.id);
      setOpen(false);
    } catch (err) {
      toast({
        type: "conversation",
        description: `Re-classify failed: ${err instanceof Error ? err.message : String(err)}`,
        variant: "error",
      });
    } finally {
      setBusy(null);
    }
  };

  const label = category ?? "Uncategorized";
  const colorClass = colorClassFor(category ?? "");

  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Badge
          as="button"
          className="hover:opacity-80"
          colorClass={colorClass}
          aria-label={`Conversation category: ${label}`}
          icon={
            busy === "classify" ? (
              <MdAutoAwesome className="size-3 animate-pulse" />
            ) : undefined
          }
        >
          {label}
        </Badge>
      }
      contentClassName="w-56 p-1"
    >
        <ConfigPopoverHeader
          label="Set category"
          descriptor={conversationCategoryConfig}
        />
        <ul className="space-y-px">
          {categories.map((c) => {
            const selected = c === category;
            return (
              <li key={c}>
                <Row
                  size="sm"
                  hover="accent"
                  onClick={() => onPick(c)}
                  disabled={busy !== null}
                  icon={
                    <span
                      className={`inline-flex size-3 items-center justify-center ${selected ? "opacity-100" : "opacity-0"}`}
                    >
                      <MdCheck className="size-3" />
                    </span>
                  }
                >
                  <Badge size="sm" colorClass={colorClassFor(c)}>
                    {c}
                  </Badge>
                </Row>
              </li>
            );
          })}
        </ul>
        <div className="my-1 h-px bg-border" />
        <Row
          size="sm"
          hover="accent"
          onClick={onReclassify}
          disabled={busy !== null}
          icon={
            <MdAutoAwesome
              className={`size-3 ${busy === "classify" ? "animate-pulse" : ""}`}
            />
          }
        >
          {busy === "classify" ? "Re-classifying…" : "Re-classify with Haiku"}
        </Row>
    </InlinePopover>
  );
}
