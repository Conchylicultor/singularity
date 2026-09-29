import { defineHostPool } from "./pool";

// The global push mutex, folded onto the host-pool primitive. `size 1` ⇒ at most
// one push runs host-wide. Who holds it and who waits on it is read from the op
// log (a push's `push-mutex` wait and its `granted`), not from this lock file.
export const pushPool = defineHostPool({ id: "push", size: 1 });
