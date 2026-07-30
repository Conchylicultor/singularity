/**
 * The `Editor.Block` renderer every void container registers — it deliberately
 * paints nothing.
 *
 * `BlockRow`'s anchored branch never dispatches `Editor.Block` for a type
 * declaring `anchor: true`: the row has no line, so there is nothing for a block
 * renderer to render. The registration it hangs off is NOT vestigial — it is
 * where the HANDLE lives, and the handle is what the insert palette, the
 * markdown pipeline, paste, the turn-into list and `useAnchorTypes()` (the
 * reducer's `anchorTypes`) all read. The row's paint comes from the container's
 * `Editor.BlockFrame` contribution instead: the backdrop plus its `anchor`
 * decoration.
 *
 * One shared function rather than a per-container stub, for the same reason
 * `BlockTextRenderer` is shared verbatim by every text type: converting between
 * two containers then resolves to the SAME renderer and reconciles in place.
 */
export function ContainerNoRow() {
  return null;
}
