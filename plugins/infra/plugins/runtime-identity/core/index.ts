export {
  declareRuntimeNamespace,
  runtimeNamespace,
  hasRuntimeNamespace,
  isMain,
} from "./internal/runtime-identity";
export { namespaceArgv, readNamespaceArgv } from "./internal/namespace-argv";
export {
  readServingSocket,
  servingSocketPath,
} from "./internal/serving-socket";
