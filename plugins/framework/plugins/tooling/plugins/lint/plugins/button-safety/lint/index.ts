import noAsyncRawButton from "./no-async-raw-button";
import noRedundantCursorPointer from "./no-redundant-cursor-pointer";

export default {
  name: "button-safety",
  rules: {
    "no-async-raw-button": noAsyncRawButton,
    "no-redundant-cursor-pointer": noRedundantCursorPointer,
  },
};
