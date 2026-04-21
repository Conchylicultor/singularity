export interface QuickPrompt {
  id: string;
  title: string;
  prompt: string;
  rank: string;
}

function descriptor<T>(key: string) {
  return { key } as {
    readonly key: string;
    readonly __types?: { value: T; params: Record<string, never> };
  };
}

export const quickPromptsResource = descriptor<QuickPrompt[]>("quick-prompts");
