import { agentModelGuard } from "./guards/agent-model";
import { backgroundOpsGuard } from "./guards/background-ops";
import { bunScriptGuard } from "./guards/bun-script";
import { findGuard } from "./guards/find";
import { gitDiffMainGuard } from "./guards/git-diff-main";
import { gitPushGuard } from "./guards/git-push";
import { gitResetMainGuard } from "./guards/git-reset-main";
import { mainEditsGuard } from "./guards/main-edits";
import { mainWritesGuard } from "./guards/main-writes";
import { migrationsGuard } from "./guards/migrations";
import { pollLoopGuard } from "./guards/poll-loop";
import { postgresGuard } from "./guards/postgres";
import { rgReplaceGuard } from "./guards/rg-replace";
import type { Guard } from "./types";

export const GUARDS: Guard<any>[] = [
  // Bash
  findGuard,
  bunScriptGuard,
  rgReplaceGuard,
  gitDiffMainGuard,
  gitPushGuard,
  gitResetMainGuard,
  migrationsGuard,
  mainWritesGuard,
  postgresGuard,
  backgroundOpsGuard,
  pollLoopGuard,
  // File writes
  mainEditsGuard,
  // Agent
  agentModelGuard,
];
