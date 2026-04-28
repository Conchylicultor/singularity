// `origin` tells the browser-side NotificationsClient which WS endpoint owns
// this resource: per-worktree backends serve the default origin, central
// serves resources tagged "central" via /ws/central-notifications.
export type ResourceOrigin = "central";

export interface ResourceDescriptor<T, P extends Record<string, string> = Record<string, string>> {
  key: string;
  origin?: ResourceOrigin;
  readonly __types?: { value: T; params: P };
}

export function resourceDescriptor<T, P extends Record<string, string> = Record<string, never>>(
  key: string,
): ResourceDescriptor<T, P> {
  return { key };
}

export function centralResourceDescriptor<T, P extends Record<string, string> = Record<string, never>>(
  key: string,
): ResourceDescriptor<T, P> {
  return { key, origin: "central" };
}
