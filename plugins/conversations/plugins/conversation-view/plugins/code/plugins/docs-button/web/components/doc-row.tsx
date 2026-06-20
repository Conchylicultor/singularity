import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { MdArticle } from "react-icons/md";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { EditedFileStatus } from "@plugins/conversations/plugins/conversation-view/plugins/code/core";
import { gitStatusDot } from "@plugins/conversations/plugins/conversation-view/plugins/code/web";

export function DocRow({
  path,
  status,
  selected,
  onSelect,
}: {
  path: string;
  status: EditedFileStatus;
  selected: boolean;
  onSelect: () => void;
}) {
  const slash = path.lastIndexOf("/");
  const dir = slash >= 0 ? path.slice(0, slash + 1) : "";
  const basename = slash >= 0 ? path.slice(slash + 1) : path;
  const muted = status === "deleted";

  return (
    <button
      type="button"
      disabled={muted}
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "w-full text-left text-caption hover:bg-muted/60 disabled:cursor-not-allowed",
        muted && "opacity-60",
        selected && "bg-muted",
      )}
      title={`${status} — ${path}`}
    >
      <Frame
        gap="xs"
        className="px-sm py-2xs"
        leading={
          <>
            <StatusDot colorClass={gitStatusDot(status)} />
            <MdArticle className="size-3 text-muted-foreground" />
          </>
        }
        content={
          <Text className={cn(!muted && "font-medium")}>{basename}</Text>
        }
        meta={
          dir ? <Text className="text-muted-foreground">{dir}</Text> : undefined
        }
      />
    </button>
  );
}
