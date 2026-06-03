import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { PageLinks } from "@plugins/page/plugins/links/server";
import { pageLinkBlock } from "../core";

export default {
  name: "Page Link Block",
  description:
    "Link-to-page block type: references another page as a clickable block; feeds the backlinks index.",
  contributions: [
    PageLinks.Extractor({
      type: pageLinkBlock.type,
      // Defensive parse — `data` is raw jsonb. Yield the target page id (if any).
      extract: (data) => {
        const r = pageLinkBlock.schema.safeParse(data);
        return r.success && r.data.pageId ? [r.data.pageId] : [];
      },
    }),
  ],
} satisfies ServerPluginDefinition;
