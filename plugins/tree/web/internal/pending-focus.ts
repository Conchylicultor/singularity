// Single module-level slot for "the input that should focus on next mount".
// Used to survive the unmount/remount that follows a route change after
// creating or selecting a new row.

let pending: string | null = null;

export const pendingFocus = {
  set(id: string): void {
    pending = id;
  },
  take(): string | null {
    const id = pending;
    pending = null;
    return id;
  },
};
