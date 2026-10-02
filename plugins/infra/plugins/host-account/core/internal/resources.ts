import { liveValue } from "@plugins/network/plugins/live/core";
import { HostAccountSchema } from "./account";

/**
 * The OS account this backend runs as. Read once per backend process (it does
 * not change under a running process) and pushed like any value. No
 * placeholder: until the first read lands, `useLive` reports it loading.
 */
export const hostAccount = liveValue("host-account", {
  schema: HostAccountSchema,
});
