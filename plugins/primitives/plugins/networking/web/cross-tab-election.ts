export interface CrossTabElectionCallbacks<TMsg> {
  onElected(): void;
  onFollowerMessage(msg: TMsg): void;
  onLeaderMessage(msg: TMsg): void;
  onFollowerJoined(): void;
}

interface CrossTabElectionOptions {
  heartbeatMs?: number;
  timeoutMs?: number;
}

type ChannelFrame<T> =
  | { k: "down"; msg: T }
  | { k: "up"; msg: T }
  | { k: "hb" }
  | { k: "hello" };

const DEFAULT_HEARTBEAT_MS = 4_000;
const DEFAULT_TIMEOUT_MS = 12_000;

export class CrossTabElection<TMsg> {
  isLeader = false;

  private callbacks: CrossTabElectionCallbacks<TMsg>;
  private heartbeatMs: number;
  private timeoutMs: number;
  private channel: BroadcastChannel | null = null;
  private locks: LockManager | null = null;
  private closed = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private lastLeaderSignal = 0;

  constructor(
    private name: string,
    callbacks: CrossTabElectionCallbacks<TMsg>,
    opts?: CrossTabElectionOptions,
  ) {
    this.callbacks = callbacks;
    this.heartbeatMs = opts?.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
    this.timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const hasChannel = typeof BroadcastChannel !== "undefined";
    this.locks =
      typeof navigator !== "undefined"
        ? // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          (navigator as Navigator & { locks?: LockManager }).locks ?? null
        : null;

    if (!hasChannel || !this.locks) {
      this.isLeader = true;
      callbacks.onElected();
      return;
    }

    this.channel = new BroadcastChannel(this.name);
    this.channel.onmessage = this.onFrame;
    this.post({ k: "hello" });
    this.requestLock(false);
  }

  broadcast(msg: TMsg): void {
    this.post({ k: "down", msg });
  }

  sendToLeader(msg: TMsg): void {
    this.post({ k: "up", msg });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
    this.channel?.close();
    this.channel = null;
  }

  // --- internal -------------------------------------------------------------

  private requestLock(steal: boolean): void {
    if (this.closed || !this.locks) return;
    const opts: LockOptions = { mode: "exclusive", steal };
    this.locks
      .request(this.name, opts, () => {
        if (this.closed) return;
        this.becomeLeader();
        return new Promise<void>(() => {});
      })
      .catch((err: unknown) => {
        if (this.closed) return;
        if (err instanceof DOMException && err.name === "AbortError") {
          this.demoteToFollower();
          return;
        }
        throw err;
      });
    if (!steal) this.armTimeout();
  }

  private becomeLeader(): void {
    if (this.closed) return;
    this.isLeader = true;
    this.stopTimeout();
    this.startHeartbeat();
    this.callbacks.onElected();
  }

  private demoteToFollower(): void {
    if (this.closed) return;
    this.isLeader = false;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.requestLock(false);
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      this.post({ k: "hb" });
    }, this.heartbeatMs);
  }

  private armTimeout(): void {
    this.lastLeaderSignal = Date.now();
    this.timeoutTimer = setTimeout(() => this.checkAlive(), this.timeoutMs);
  }

  private stopTimeout(): void {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  private checkAlive(): void {
    if (this.closed || this.isLeader) return;
    const elapsed = Date.now() - this.lastLeaderSignal;
    if (elapsed >= this.timeoutMs) {
      this.requestLock(true);
    } else {
      this.timeoutTimer = setTimeout(
        () => this.checkAlive(),
        this.timeoutMs - elapsed,
      );
    }
  }

  private touchLeader(): void {
    this.lastLeaderSignal = Date.now();
  }

  private onFrame = (ev: MessageEvent<ChannelFrame<TMsg>>): void => {
    if (this.closed) return;
    const frame = ev.data;
    switch (frame.k) {
      case "down":
        if (!this.isLeader) {
          this.touchLeader();
          this.callbacks.onLeaderMessage(frame.msg);
        }
        return;
      case "up":
        if (this.isLeader) this.callbacks.onFollowerMessage(frame.msg);
        return;
      case "hb":
        if (!this.isLeader) this.touchLeader();
        return;
      case "hello":
        if (this.isLeader) this.callbacks.onFollowerJoined();
        return;
    }
  };

  private post(frame: ChannelFrame<TMsg>): void {
    if (this.channel && !this.closed) {
      try {
        this.channel.postMessage(frame);
      } catch {
        // ignore
      }
    }
  }
}
