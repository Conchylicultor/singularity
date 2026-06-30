// Full Gmail access (read, send, modify labels/threads, trash & permanent delete).
// One broad scope so a consumer plugin can build a complete Gmail client without
// re-prompting the user for additional scopes later. Requested only when the user
// enables Gmail access in Settings; Google's `include_granted_scopes=true` (set in
// the Google provider descriptor) keeps previously granted scopes (e.g. Drive).
export const GMAIL_SCOPES = ["https://mail.google.com/"] as const;
