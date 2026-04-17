import type { Attempt, Push, Task } from "../server/schema";

function descriptor<T>(key: string) {
  return { key } as {
    readonly key: string;
    readonly __types?: { value: T; params: Record<string, never> };
  };
}

export const tasksResource = descriptor<Task[]>("tasks");
export const attemptsResource = descriptor<Attempt[]>("attempts");
export const pushesResource = descriptor<Push[]>("pushes");
