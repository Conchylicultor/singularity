import noAbsorbedFailure from "./no-absorbed-failure";
import noBareCatch from "./no-bare-catch";
import noFloatingPromises from "./no-floating-promises";

export default {
  name: "promise-safety",
  rules: {
    "no-absorbed-failure": noAbsorbedFailure,
    "no-bare-catch": noBareCatch,
    "no-floating-promises": noFloatingPromises,
  },
};
