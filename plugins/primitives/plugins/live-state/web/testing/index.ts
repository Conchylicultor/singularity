// Stand-ins for the server frames that advance a resource's causal floor, for a
// test driving an optimistic hook without a live socket. The bodies stay beside
// the registries they write; the notifications client is their shipping caller.
export { noteResourceWatermark } from "../watermark-registry";
export { noteResourceTxAcks } from "../tx-ack-registry";
// The client class itself, for a test that spies on one of its methods.
export { NotificationsClient } from "../notifications-client";
