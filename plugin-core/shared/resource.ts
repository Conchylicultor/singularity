export interface ResourceDescriptor<T, P extends Record<string, string> = Record<string, string>> {
  key: string;
  readonly __types?: { value: T; params: P };
}

export function resourceDescriptor<T, P extends Record<string, string> = Record<string, never>>(
  key: string,
): ResourceDescriptor<T, P> {
  return { key };
}
