import noModuleScopeDom from "./no-module-scope-dom";

export default {
  name: "dom-access-safety",
  rules: {
    "no-module-scope-dom": noModuleScopeDom,
  },
  ignores: {
    // Vite browser entry points: reached only by a `<script type="module">` tag
    // in their sibling .html, never by a static import, so they can never be
    // pulled into a non-DOM module graph. Mounting the app IS their whole body.
    "no-module-scope-dom": [
      "plugins/framework/plugins/web-core/web/main.tsx",
      "plugins/primitives/plugins/css/plugins/layout-harness/web/internal/entry.tsx",
    ],
  },
};
