import { agentModelGuard } from "./guards/agent-model";
import { findGuard } from "./guards/find";
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
  migrationsGuard,
  mainWritesGuard,
  postgresGuard,
  // File writes
  mainEditsGuard,
  // Agent
  agentModelGuard,
];

export type { Guard, GuardContext, Verdict, ToolMatcher, FileHint } from "./types";
export { defineGuard } from "./define-guard";
export { parseShell } from "./parse-shell";
export { createContext } from "./context";
