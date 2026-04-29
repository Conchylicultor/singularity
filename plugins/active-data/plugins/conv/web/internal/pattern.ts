// Conversation IDs are formatted as `conv-<unix-seconds>-<4 base36 chars>` —
// see `plugins/conversations/server/internal/lifecycle.ts`. Word boundaries
// keep the pattern from biting into longer identifiers (e.g. `conv-xxx-extra`).
export const CONV_ID_RE = /\bconv-\d+-[a-z0-9]{4}\b/g;
