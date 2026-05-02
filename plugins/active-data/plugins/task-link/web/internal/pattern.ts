// Task IDs come in two formats depending on creation path:
// - tasks.ts:       `task-${Date.now()}-${rand.slice(2,8)}`  → 13-digit ms  + 6-char suffix
// - cross-table.ts: `task-${Math.floor(Date.now()/1000)}-${rand.slice(2,6)}` → 10-digit s + 4-char suffix
export const TASK_ID_RE = /\btask-\d+-[a-z0-9]{4,8}\b/g;
