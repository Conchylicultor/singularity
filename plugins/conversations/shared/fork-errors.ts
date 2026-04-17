export interface ForkError {
  id: string;
  attemptId: string;
  message: string;
}

// Mirrors `resourceDescriptor` from @core — plugin-core is web-only, this
// module is shared with the server so it can't import from it.
function descriptor<T>(key: string) {
  return { key } as {
    readonly key: string;
    readonly __types?: { value: T; params: Record<string, never> };
  };
}

export const forkErrorsResource = descriptor<ForkError | null>(
  "conversations.fork-errors",
);
