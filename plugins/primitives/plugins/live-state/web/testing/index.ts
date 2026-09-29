// Stand-ins for the server frames that advance a resource's causal floor, for a
// test driving an optimistic hook without a live socket. The bodies stay beside
// the registries they write; the notifications client is their shipping caller.
export { noteResourceWatermark } from "../watermark-registry";
export { noteResourceTxAcks } from "../tx-ack-registry";
// The client class itself, for a test that spies on one of its methods.
export { NotificationsClient } from "../notifications-client";
// The page-global contract-mismatch store starts empty for every suite.
// `mark…` is the transport's writer, stood in for by a test with no server.
export {
  markResourceContractMismatch,
  resetResourceContractMismatches,
} from "../resource-contract-store";
