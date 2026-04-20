// In-plugin imports go straight to the leaf so the frontend bundle doesn't
// pull `server/api`'s runtime surface. Cross-plugin consumers go through
// `@plugins/tasks-core/server`.
import type { Attempt, Push, Task } from "@plugins/tasks-core/shared";

export type { Attempt, Push, Task } from "@plugins/tasks-core/shared";

function descriptor<T>(key: string) {
  return { key } as {
    readonly key: string;
    readonly __types?: { value: T; params: Record<string, never> };
  };
}

export const tasksResource = descriptor<Task[]>("tasks");
export const attemptsResource = descriptor<Attempt[]>("attempts");
export const pushesResource = descriptor<Push[]>("pushes");
