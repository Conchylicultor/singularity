import { conversationsLiveResource } from "./resources";

// `affectedIds` (Layer 2) scopes the downstream attempts/tasks recompute to the
// changed conversations. Omit it (membership changes: adopt/create/delete) for
// a full recompute. conversationsLiveResource itself is a push-object resource,
// so the ids only ride the cascade — its own send path ignores them.
export function notifyConversationsChanged(affectedIds?: string[]): void {
  conversationsLiveResource.notify(undefined, affectedIds ? { affectedIds } : undefined);
}
