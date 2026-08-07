// The id of one (conversation, category) assignment row.
//
// A conversation now carries one row PER configured category, so the natural key
// is the pair. The live-state point resource requires its subscription key to BE
// the table's single-column primary key (the change feed routes a write by
// intersecting changed row ids with each tuple's id set), so the pair is folded
// into one deterministic string that IS the primary key.
//
// Both runtimes import this: the server mints the id it writes, the client mints
// the id it subscribes to. If the two ever computed it differently the
// subscription would silently read nothing, so there is exactly one definition.
//
// Neither component may contain `:` (the separator) or `,` (the point codec's id
// separator — `pointResourceDescriptor.encode` throws on a comma). Conversation
// ids are `conv-<ts>-<slug>`; category ids are UUIDs minted by the settings UI or
// hand-authored slugs in `config.jsonc`.
export function categoryRowId(conversationId: string, categoryId: string): string {
  return `${conversationId}:${categoryId}`;
}
