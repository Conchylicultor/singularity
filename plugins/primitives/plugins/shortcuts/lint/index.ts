import noWindowKeyListener from "./no-window-key-listener";

export default {
  name: "shortcuts",
  rules: {
    "no-window-key-listener": noWindowKeyListener,
  },
  ignores: {
    // The registry's own dispatcher is the one sanctioned page-wide listener.
    "no-window-key-listener": [
      "plugins/primitives/plugins/shortcuts/web/internal/shortcut-manager.tsx",
    ],
  },
};
