import noAdhocInstallSink from "./no-adhoc-install-sink";
import noLaunderedPeek from "./no-laundered-peek";
import noRenderPhasePeek from "./no-render-phase-peek";

export default {
  name: "install-sink",
  rules: {
    "no-render-phase-peek": noRenderPhasePeek,
    "no-laundered-peek": noLaunderedPeek,
    "no-adhoc-install-sink": noAdhocInstallSink,
  },
};
