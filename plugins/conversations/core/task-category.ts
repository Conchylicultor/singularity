// The category a conversation's own task is filed under when nothing else owns
// it — a bare launch, an adopted session, the agent manager's home prompt. The
// server contributes the matching TaskCategory registration; it lives in
// `core/` because other plugins file tasks under it too.
export const CONVERSATIONS_CATEGORY_ID = "conversations";
