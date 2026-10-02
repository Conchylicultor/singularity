import noRawWorker from "./no-raw-worker";

export default {
  name: "daemon",
  rules: {
    "no-raw-worker": noRawWorker,
  },
  ignores: {
    // Every path here starts a worker thread in backend code without
    // defineDaemon. The list is the exception register — add a line only with
    // its reason. Long-lived child PROCESSES are routed here by
    // spawn-safety/no-raw-bun-spawn's message.
    "no-raw-worker": [],
  },
};
