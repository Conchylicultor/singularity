// A proxy in front of the cluster whose forwarding can be switched off, so a
// suite can make any connection's calls go unanswered.
export { startBlackHoleProxy, type BlackHoleProxy } from "./black-hole-proxy";
