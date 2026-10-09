import { defineIdKind } from "@plugins/ids/core";

/**
 * A vocabulary tag's id — `tag-<epochSeconds>-<6>`. Stamped (the default shape):
 * a tag is something a person or agent names, minted rarely, and readable in a
 * log line or a DB row. The id is what pages store, so renaming a tag or
 * changing its color never touches a page.
 */
export const pageTagIdKind = defineIdKind({ prefix: "tag", label: "Tag" });
