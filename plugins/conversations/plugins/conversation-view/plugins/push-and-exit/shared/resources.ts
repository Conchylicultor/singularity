export type JobState =
  | { status: "running" }
  | { status: "clean" }
  | { status: "flag"; text: string }
  | { status: "error"; message: string };

function descriptor<T>(key: string) {
  return { key } as {
    readonly key: string;
    readonly __types?: { value: T; params: Record<string, never> };
  };
}

export const pushAndExitResource = descriptor<Record<string, JobState>>(
  "push-and-exit",
);
