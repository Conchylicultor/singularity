import { HttpError } from "@plugins/infra/plugins/endpoints/server";
import { ContainerTask } from "./contribution";

// The aggregate of every contributed container-task id. Populated by the boot
// loader before any request, so reads are synchronous and stable.
export function containerTaskIdSet(): Set<string> {
  return new Set(ContainerTask.getContributions().map((c) => c.id));
}

export function isContainerTask(id: string): boolean {
  return containerTaskIdSet().has(id);
}

// Authoritative guard: a container/meta task is a system folder and must never
// own an attempt. Reject loudly so programmatic misuse surfaces instead of
// silently flipping a folder's computed status to in_progress.
export function assertNotContainerTask(id: string): void {
  if (isContainerTask(id)) {
    throw new HttpError(
      400,
      `Cannot start an attempt on container task "${id}" — it is a system folder. Create a child task and launch that instead.`,
    );
  }
}
