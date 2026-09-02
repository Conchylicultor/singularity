import { Log } from "@plugins/primitives/plugins/log-channels/server";

// Single owner of the "backup" log channel. `Log.channel` throws on a duplicate
// id, so it is created exactly once here.
//
// What flows through it is the supervised child's transcript: `supervised-run`
// tails the run's transcript FILE and republishes each line onto this channel,
// in this backend and in whichever one adopts the run after a restart. So the
// output of `tar`, `pg_dump` and the Drive upload is readable live and again
// from the top after a reattach.
export const backupLog = Log.channel("backup");
