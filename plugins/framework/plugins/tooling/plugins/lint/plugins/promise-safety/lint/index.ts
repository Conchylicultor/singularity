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
  /**
   * These three stay enforced in test/e2e files, which contributed rules are
   * otherwise off in (see lint/core/non-app-globs.ts). They are not
   * architecture rules — each catches a real bug wherever it fires, and a test
   * is precisely where such a bug is most damaging: an unawaited promise or a
   * swallowed error makes a suite pass while asserting nothing, so the exemption
   * that would silence them here is the one that would hide a broken test.
   */
  enforceEverywhere: [
    "no-absorbed-failure",
    "no-bare-catch",
    "no-floating-promises",
  ],
};
