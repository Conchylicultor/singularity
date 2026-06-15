import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import {
  stageReorderDefault,
  applyReorderDefault,
  applyAllReorderDefaults,
  discardReorderDefault,
  discardAllReorderDefaults,
} from "../core/endpoints";

// Stage a reorder layout as a "default for everyone" (worktree-local holding
// area). Last-write-wins per slot.
export function useStageReorderDefault() {
  return useEndpointMutation(stageReorderDefault);
}

// Apply a single staged reorder default: enqueue the landing job, which lands
// the committed git-layer override on `main` via a throwaway worktree and drops
// the staged row on success.
export function useApplyReorderDefault() {
  return useEndpointMutation(applyReorderDefault);
}

// Apply every staged reorder default in one batch: enqueues a single landing
// job that lands all staged overrides on `main` in one push.
export function useApplyAllReorderDefaults() {
  return useEndpointMutation(applyAllReorderDefaults);
}

// Discard a staged reorder default without writing anything.
export function useDiscardReorderDefault() {
  return useEndpointMutation(discardReorderDefault);
}

// Discard the entire staged reorder default set in one shot (cancel-all).
export function useDiscardAllStagedDefaults() {
  return useEndpointMutation(discardAllReorderDefaults);
}
