import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import {
  PageDetail,
  PageTree,
} from "@plugins/apps/plugins/pages/plugins/page-tree/web";
import {
  AddTagTool,
  UnderTitleTags,
  useHasNoTags,
  useHasTags,
} from "./components/header-tags";
import { TagDotsMarker, TagsField } from "./components/sidebar-tags";

export default {
  description:
    "Page tags in the Pages app: the chips under a page's title with their picker (an Add tag tool in the header's hover row while the page has none), a tags field in the sidebar DataView (filter and group by tag), and colored dots marking each tagged page's sidebar row.",
  contributions: [
    PageDetail.UnderTitle({
      id: "tags",
      component: UnderTitleTags,
      useAvailable: useHasTags,
    }),
    PageDetail.HeaderTool({
      id: "add-tag",
      component: AddTagTool,
      useAvailable: useHasNoTags,
    }),
    // A filter / group dimension of the sidebar schema, never body text.
    PageTree.Fields({ id: "tags", section: null, component: TagsField }),
    PageTree.RowMarker({ id: "tags", component: TagDotsMarker }),
  ],
} satisfies PluginDefinition;
