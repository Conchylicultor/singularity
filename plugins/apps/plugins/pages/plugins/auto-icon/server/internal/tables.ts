import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";
import { defineExtensionShape } from "@plugins/infra/plugins/entity-extensions/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { dateField } from "@plugins/fields/plugins/date/plugins/config/core";
import { _blocks } from "@plugins/page/plugins/editor/server";

// `page_blocks_ext_auto_icon`: presence = "icon generation has run for this
// page", so the edit-triggered job never runs for it again — a user's later pick,
// or a Remove, stays. `emoji` is what the model picked (the page's icon may
// differ: the user's pick wins under `onlyIfUnset`); `generatedAt` is when. Only
// the server reads it, so the shape lives here rather than in `shared/`.
const autoIconShape = defineExtensionShape({
  key: "blockId",
  fields: {
    emoji: textField(),
    generatedAt: dateField(),
  },
});

export const pageBlocksAutoIcon = defineExtension(
  _blocks,
  "auto_icon",
  autoIconShape,
);
// Re-exported so drizzle-kit discovers the underlying pgTable.
export const _pageBlocksAutoIconExt = pageBlocksAutoIcon.table;
