import { homedir } from "node:os";
import path from "node:path";

const SINGULARITY_DIR = path.join(homedir(), ".singularity");

export const SECRETS_DIR = path.join(SINGULARITY_DIR, "secrets");
export const STORE_PATH = path.join(SINGULARITY_DIR, "secrets.json.enc");
export const KEY_PATH = path.join(SECRETS_DIR, ".key");

export const LEGACY_AUTH_DIR = path.join(SINGULARITY_DIR, "auth");
export const LEGACY_AUTH_BLOB = path.join(LEGACY_AUTH_DIR, "tokens.json.enc");
export const LEGACY_AUTH_KEY = path.join(LEGACY_AUTH_DIR, ".key");
