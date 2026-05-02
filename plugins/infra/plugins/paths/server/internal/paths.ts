import { homedir } from "node:os";
import { join } from "node:path";

export const HOME_DIR             = homedir();
export const SINGULARITY_DIR     = join(HOME_DIR, ".singularity");
export const BACKUPS_DIR         = join(HOME_DIR, ".backups/singularity");
export const SECRETS_DIR         = join(SINGULARITY_DIR, "secrets");
export const STORE_PATH          = join(SINGULARITY_DIR, "secrets.json.enc");
export const KEY_PATH            = join(SECRETS_DIR, ".key");
export const LEGACY_AUTH_DIR     = join(SINGULARITY_DIR, "auth");
export const LEGACY_AUTH_BLOB    = join(LEGACY_AUTH_DIR, "tokens.json.enc");
export const LEGACY_AUTH_KEY     = join(LEGACY_AUTH_DIR, ".key");
export const ATTACHMENTS_DIR     = join(SINGULARITY_DIR, "attachments");
export const CRASHES_DIR         = join(SINGULARITY_DIR, "crashes");
export const CLAUDE_PROJECTS_DIR = join(HOME_DIR, ".claude", "projects");
export const CLAUDE_SESSIONS_DIR = join(HOME_DIR, ".claude", "sessions");
