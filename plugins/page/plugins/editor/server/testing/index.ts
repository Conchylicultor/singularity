// Restores one trashed-blocks entry on a given executor — the pages trash
// source restores on the backend's own database — so a suite on a throwaway
// database can undo a block delete.
export { untrashBlocks } from "../internal/trash-blocks";
