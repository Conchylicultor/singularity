import { homedir } from "node:os";
import { join } from "node:path";

export const SINGULARITY_DIR = join(homedir(), ".singularity");
