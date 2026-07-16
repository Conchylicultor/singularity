import type { ComponentType, SVGProps } from "react";
import {
  MdInsertDriveFile,
  MdChecklist,
  MdFormatListBulleted,
} from "react-icons/md";
import { toDoBlock } from "@plugins/page/plugins/to-do/core";
import { bulletedListBlock } from "@plugins/page/plugins/bulleted-list/core";
import type { PageSeedBlock } from "@plugins/apps/plugins/pages/plugins/page-tree/web";

/** A quick-create starting point: a labelled tile that seeds a new page. */
export type PageTemplate = {
  id: string;
  label: string;
  description: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Page-block overrides (e.g. starting title). Omit for a blank, untitled page. */
  page?: { title?: string };
  /** Content blocks seeded into the new page, in order. Omit for the default empty text block. */
  seed?: PageSeedBlock[];
};

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: "blank",
    label: "Blank page",
    description: "Start from an empty page.",
    icon: MdInsertDriveFile,
    // No page/seed overrides → default untitled page with one empty text block.
  },
  {
    id: "to-do",
    label: "To-do list",
    description: "Track tasks with checkboxes.",
    icon: MdChecklist,
    page: { title: "To-do list" },
    seed: [{ type: toDoBlock.type, data: { text: [], checked: false } }],
  },
  {
    id: "bulleted-list",
    label: "Bulleted list",
    description: "Jot down a quick bullet list.",
    icon: MdFormatListBulleted,
    page: { title: "Bulleted list" },
    seed: [{ type: bulletedListBlock.type, data: { text: [] } }],
  },
];
