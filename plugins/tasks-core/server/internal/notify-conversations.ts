import { conversationsLiveResource } from "./resources";

export function notifyConversationsChanged(): void {
  conversationsLiveResource.notify();
}
