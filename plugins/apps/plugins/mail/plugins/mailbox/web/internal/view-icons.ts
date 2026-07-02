import type { ComponentType } from "react";
import {
  MdInbox,
  MdStarBorder,
  MdLabelImportantOutline,
  MdSend,
  MdDrafts,
  MdAllInbox,
  MdReportGmailerrorred,
  MdDeleteOutline,
} from "react-icons/md";

type IconComponent = ComponentType<{ className?: string }>;

// Web owns the system-view icon map (the view model in `mail-core/core` is
// icon-free plain data). Keyed by the system view id.
const SYSTEM_VIEW_ICONS: Record<string, IconComponent> = {
  inbox: MdInbox,
  starred: MdStarBorder,
  important: MdLabelImportantOutline,
  sent: MdSend,
  drafts: MdDrafts,
  all: MdAllInbox,
  spam: MdReportGmailerrorred,
  trash: MdDeleteOutline,
};

export function systemViewIcon(id: string): IconComponent {
  return SYSTEM_VIEW_ICONS[id] ?? MdInbox;
}
