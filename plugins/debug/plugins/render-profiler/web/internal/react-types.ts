// Minimal private React fiber typings + constants. These are React internals
// (field names + WorkTag/flag values) — stable across React 18–19 and mirrored
// by React DevTools / bippy, but private. Centralized here with loose `any`
// where the real shape is irrelevant to us.

import type { ProfilerReport, ProfilerStartOptions } from "../../core";

/** `PerformedWork` — set when a component runs its render fn (not on bailout). */
export const PerformedWork = 0b1;

// WorkTag values (react-reconciler ReactWorkTags).
export const FunctionComponent = 0;
export const ClassComponent = 1;
export const HostRoot = 3;
export const HostComponent = 5;
export const ForwardRef = 11;
export const MemoComponent = 14;
export const SimpleMemoComponent = 15;

export interface ContextItem {
  context: unknown;
  memoizedValue: unknown;
  next: ContextItem | null;
}

export interface Fiber {
  tag: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- React internal: component fn/class/forwardRef/memo object
  type: any;
  key: string | null;
  flags: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- React internal: hook linked-list node
  memoizedState: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- React internal: props object
  memoizedProps: any;
  dependencies: { firstContext: ContextItem | null } | null;
  child: Fiber | null;
  sibling: Fiber | null;
  return: Fiber | null;
  alternate: Fiber | null;
}

export interface FiberRoot {
  current: Fiber;
}

/** The window-level imperative API installed by global-api.ts. */
export interface RenderProfilerGlobal {
  start: (opts?: ProfilerStartOptions) => void;
  stop: () => void;
  getReport: () => ProfilerReport;
  isRunning: () => boolean;
}

/** The passive commit bridge installed by index.html, before React loads. */
export interface ReactDevtoolsHook {
  __commitSubscribers?: Set<(root: FiberRoot) => void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the full hook has many fields we don't touch
  [key: string]: any;
}

declare global {
  interface Window {
    __REACT_DEVTOOLS_GLOBAL_HOOK__?: ReactDevtoolsHook;
    __reactRenderProfiler?: RenderProfilerGlobal;
  }
}
