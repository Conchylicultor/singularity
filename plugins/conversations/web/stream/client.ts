import { ReconnectingEventSource } from "@core";
import type { ConversationEvent } from "@plugins/conversations/shared/protocol";
import type { TmuxLive } from "@plugins/conversations/shared/types";

// Inter-tab envelope sent over BroadcastChannel between leader and followers.
// Never traverses the network.
type LeaderEnvelope =
  | { kind: "event"; event: ConversationEvent }
  | { kind: "request-snapshot" }
  | { kind: "snapshot"; tmux: Array<[string, TmuxLive]> }
  | { kind: "reset" };

const STREAM_URL = "/api/conversations/stream";
const LOCK_NAME = "singularity:conversations:stream";
const CHANNEL_NAME = "singularity:conversations:stream";

type Listener = (event: ConversationEvent) => void;

class ConversationStreamClient {
  private listeners = new Set<Listener>();
  private channel: BroadcastChannel;
  private isLeader = false;
  private es: ReconnectingEventSource | null = null;
  private tmuxCache = new Map<string, TmuxLive>();
  private snapshotRequested = false;

  constructor() {
    this.channel = new BroadcastChannel(CHANNEL_NAME);
    this.channel.addEventListener("message", this.onChannelMessage);

    if (typeof navigator !== "undefined" && navigator.locks) {
      void navigator.locks.request(
        LOCK_NAME,
        { mode: "exclusive" },
        () => this.becomeLeader(),
      );
    } else {
      // Browsers without navigator.locks: every tab opens its own SSE.
      this.becomeLeader();
    }

    // As a fresh follower, ask whoever is leader for current snapshot.
    this.requestSnapshot();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private becomeLeader(): Promise<void> {
    this.isLeader = true;
    this.openSse();
    // Hold the lock for the lifetime of the tab. Released automatically on
    // tab close, BFCache eviction, or navigation.
    return new Promise<void>(() => {});
  }

  private openSse() {
    this.es = new ReconnectingEventSource({
      url: STREAM_URL,
      onMessage: (data) => {
        let event: ConversationEvent;
        try {
          event = JSON.parse(data);
        } catch {
          return;
        }
        this.applyEvent(event);
        this.broadcast({ kind: "event", event });
      },
      onStatusChange: (status) => {
        if (status === "open" && this.es) {
          // Reconnect (or first connect): drop stale snapshot, server will
          // replay its own. Notify followers to do the same.
          if (this.tmuxCache.size > 0) {
            this.tmuxCache.clear();
            this.broadcast({ kind: "reset" });
          }
        }
      },
    });
  }

  private applyEvent(event: ConversationEvent) {
    if (event.type === "tmux") {
      if ("gone" in event) {
        this.tmuxCache.delete(event.id);
      } else {
        this.tmuxCache.set(event.id, { task: event.task, idle: event.idle });
      }
    }
    this.fanOut(event);
  }

  private fanOut(event: ConversationEvent) {
    for (const listener of this.listeners) listener(event);
  }

  private broadcast(envelope: LeaderEnvelope) {
    this.channel.postMessage(envelope);
  }

  private requestSnapshot() {
    if (this.snapshotRequested) return;
    this.snapshotRequested = true;
    this.broadcast({ kind: "request-snapshot" });
  }

  private onChannelMessage = (ev: MessageEvent<LeaderEnvelope>) => {
    const env = ev.data;
    if (env.kind === "request-snapshot") {
      if (this.isLeader) {
        this.broadcast({
          kind: "snapshot",
          tmux: Array.from(this.tmuxCache.entries()),
        });
      }
      return;
    }
    if (this.isLeader) return; // leader generates events, doesn't consume them
    if (env.kind === "event") {
      this.applyEvent(env.event);
    } else if (env.kind === "snapshot") {
      this.tmuxCache = new Map(env.tmux);
      for (const [id, info] of this.tmuxCache) {
        this.fanOut({ type: "tmux", id, task: info.task, idle: info.idle });
      }
    } else if (env.kind === "reset") {
      this.tmuxCache.clear();
      this.snapshotRequested = false;
      this.requestSnapshot();
    }
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __singularityConversationStream__: ConversationStreamClient | undefined;
}

export function getConversationStream(): ConversationStreamClient {
  if (!globalThis.__singularityConversationStream__) {
    globalThis.__singularityConversationStream__ = new ConversationStreamClient();
  }
  return globalThis.__singularityConversationStream__;
}
