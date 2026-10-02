import { useLive } from "@plugins/network/plugins/live/web";
import { hostAccount } from "../../core";

/**
 * The OS account this backend runs as — `loading` until the first read lands,
 * never a placeholder name.
 */
export function useHostAccount() {
  return useLive(hostAccount);
}
