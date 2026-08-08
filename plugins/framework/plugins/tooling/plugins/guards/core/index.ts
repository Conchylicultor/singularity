export { GUARDS } from "./registry";
export type {
  AllowVerdict,
  DenyVerdict,
  InformVerdict,
  Guard,
  GuardContext,
  Verdict,
  ToolMatcher,
  FileHint,
} from "./types";
export { defineGuard } from "./define-guard";
export { parseShell } from "./parse-shell";
export { createContext } from "./context";
export {
  classify,
  detectPoll,
  watchSubjects,
  THRESHOLD,
  WINDOW_MS,
  WINDOW_SIZE,
} from "./poll-detect";
export type {
  CommandClass,
  PollDecision,
  WatchSubject,
  WindowEntry,
} from "./poll-detect";
