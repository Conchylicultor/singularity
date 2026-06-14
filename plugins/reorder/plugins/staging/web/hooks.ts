import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import {
  stageReorderDefault,
  applyReorderDefault,
  discardReorderDefault,
} from "../core/endpoints";

// Stage a reorder layout as a "default for everyone" (worktree-local holding
// area). Last-write-wins per slot.
export function useStageReorderDefault() {
  return useEndpointMutation(stageReorderDefault);
}

// Apply a staged reorder default: write the committed git-layer override and
// drop the staged row.
export function useApplyReorderDefault() {
  return useEndpointMutation(applyReorderDefault);
}

// Discard a staged reorder default without writing anything.
export function useDiscardReorderDefault() {
  return useEndpointMutation(discardReorderDefault);
}
