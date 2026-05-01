import { homedir } from "node:os";
import { join } from "node:path";

export const SINGULARITY_DIR     = join(homedir(), ".singularity");
export const SECRETS_DIR         = join(SINGULARITY_DIR, "secrets");
export const STORE_PATH          = join(SINGULARITY_DIR, "secrets.json.enc");
export const KEY_PATH            = join(SECRETS_DIR, ".key");
export const LEGACY_AUTH_DIR     = join(SINGULARITY_DIR, "auth");
export const LEGACY_AUTH_BLOB    = join(LEGACY_AUTH_DIR, "tokens.json.enc");
export const LEGACY_AUTH_KEY     = join(LEGACY_AUTH_DIR, ".key");
export const ATTACHMENTS_DIR     = join(SINGULARITY_DIR, "attachments");
export const CRASHES_DIR         = join(SINGULARITY_DIR, "crashes");
export const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");
export const CLAUDE_SESSIONS_DIR = join(homedir(), ".claude", "sessions");
