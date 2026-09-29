import { z } from "zod";
import { defineDep, type Ready } from "@plugins/infra/plugins/deps/server";
import {
  pythonEnv,
  runPython,
  type PythonEnvSource,
} from "@plugins/infra/plugins/deps/plugins/python/server";

/**
 * A tiny real Python dependency (numpy only): the python kind's end-to-end
 * proof, exercised by the deps tests and `./singularity deps install
 * hello-python`. Deleted once the audio pipeline lands as the first real
 * consumer.
 */
export const helloPython = defineDep({
  id: "hello-python",
  owner: "infra/deps/hello-python",
  description: "Python + numpy, the deps python kind's smallest real consumer",
  sizeHint: "≈60 MB",
  source: pythonEnv({
    project: "plugins/infra/plugins/deps/plugins/hello-python/python",
  }),
});

const StatsSchema = z.object({
  count: z.number().int(),
  mean: z.number(),
  std: z.number(),
  numpy: z.string(),
});
export type HelloStats = z.infer<typeof StatsSchema>;

/** `hello_python.stats`: count, mean and standard deviation, with numpy. */
export function helloStats(
  ready: Ready<PythonEnvSource>,
  values: readonly number[],
  log?: (line: string) => void,
): Promise<HelloStats> {
  return runPython(ready, {
    module: "hello_python.stats",
    input: { values },
    output: StatsSchema,
    timeoutMs: 60_000,
    log,
  });
}
