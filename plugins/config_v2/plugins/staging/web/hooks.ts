import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import {
  stageConfigDefault,
  applyConfigDefault,
  applyAllConfigDefaults,
  discardConfigDefault,
  discardAllConfigDefaults,
} from "../core/endpoints";

// Stage a full config document as a "default for everyone" (worktree-local
// holding area). Last-write-wins per (pluginId, configName). Most consumers
// should call the optimistic `useStageDefault()` from the store; this raw
// mutation is exposed for completeness.
export function useStageConfigDefault() {
  return useEndpointMutation(stageConfigDefault);
}

// Apply a single staged config default: enqueue the landing job, which lands the
// committed git-layer override on `main` via a throwaway worktree and drops the
// staged row on success.
export function useApplyConfigDefault() {
  return useEndpointMutation(applyConfigDefault);
}

// Apply every staged config default in one batch: enqueues a single landing job
// that lands all staged overrides on `main` in one push.
export function useApplyAllConfigDefaults() {
  return useEndpointMutation(applyAllConfigDefaults);
}

// Discard a staged config default without writing anything.
export function useDiscardConfigDefault() {
  return useEndpointMutation(discardConfigDefault);
}

// Discard the entire staged config default set in one shot (cancel-all).
export function useDiscardAllConfigDefaults() {
  return useEndpointMutation(discardAllConfigDefaults);
}
