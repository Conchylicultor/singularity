import { helloPython } from "./internal/hello";

// hello-python's declaration: collected into infra/deps' registry through the
// `default` array, so it shows in Settings → Dependencies and
// `./singularity deps list | install hello-python` with nothing booted.
export { helloPython, helloStats } from "./internal/hello";
export type { HelloStats } from "./internal/hello";

export default [helloPython];
