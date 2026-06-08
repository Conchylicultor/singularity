import noBareCatch from "./no-bare-catch";
import noFloatingPromises from "./no-floating-promises";

export default {
  name: "promise-safety",
  rules: {
    "no-bare-catch": noBareCatch,
    "no-floating-promises": noFloatingPromises,
  },
};
