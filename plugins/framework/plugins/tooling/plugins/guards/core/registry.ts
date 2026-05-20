import { agentModelGuard } from "./guards/agent-model";
import { findGuard } from "./guards/find";
import { gitDiffMainGuard } from "./guards/git-diff-main";
import { gitPushGuard } from "./guards/git-push";
import { mainEditsGuard } from "./guards/main-edits";
import { mainWritesGuard } from "./guards/main-writes";
import { migrationsGuard } from "./guards/migrations";
import { postgresGuard } from "./guards/postgres";
import { rgReplaceGuard } from "./guards/rg-replace";
import type { Guard } from "./types";

export const GUARDS: Guard<any>[] = [
  // Bash
  findGuard,
  rgReplaceGuard,
  gitDiffMainGuard,
  gitPushGuard,
  migrationsGuard,
  mainWritesGuard,
  postgresGuard,
  // File writes
  mainEditsGuard,
  // Agent
  agentModelGuard,
];
