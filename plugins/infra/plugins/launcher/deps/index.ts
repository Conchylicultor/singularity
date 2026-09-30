// The launcher's dependency: the Go gateway binary, collected into infra/deps'
// registry through the `default` array (Settings → Dependencies,
// `./singularity deps install gateway-binary`). `./singularity start` and
// `serve-app` ensure it; a release seals it into the bundle, and the release
// launcher reads it from there.
import { gatewayBinary } from "./internal/gateway";

export { gatewayBinary } from "./internal/gateway";

export default [gatewayBinary];
