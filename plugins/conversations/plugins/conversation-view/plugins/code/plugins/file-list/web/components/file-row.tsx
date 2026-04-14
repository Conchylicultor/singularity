import { MdInsertDriveFile } from "react-icons/md";
import type { EditedFileStatus } from "@plugins/conversations/plugins/conversation-view/plugins/code/shared/protocol";

const STATUS_DOT: Record<EditedFileStatus, string> = {
  modified: "bg-blue-500",
  added: "bg-emerald-500",
  untracked: "bg-amber-500",
  deleted: "bg-muted-foreground/40",
};

export function FileRow({
  path,
  status,
}: {
  path: string;
  status: EditedFileStatus;
}) {
  const slash = path.lastIndexOf("/");
  const dir = slash >= 0 ? path.slice(0, slash + 1) : "";
  const basename = slash >= 0 ? path.slice(slash + 1) : path;
  const muted = status === "deleted";

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1 text-sm ${muted ? "opacity-60" : ""}`}
      title={`${status} — ${path}`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[status]}`}
      />
      <MdInsertDriveFile className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate text-muted-foreground">{dir}</span>
      <span className={`truncate ${muted ? "" : "font-medium"}`}>{basename}</span>
    </div>
  );
}
