import { defineConfig } from "@plugins/config_v2/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";

// Per-signal slow-op thresholds (milliseconds). All five render for free in the
// Settings → Config UI; both the server span hook and the client collector read
// them live (server via watchConfig, client via useConfig) so changes take
// effect without a restart.
export const slowOpConfig = defineConfig({
  name: "slow-op",
  fields: {
    pageLoadMs: intField({
      default: 2000,
      min: 0,
      label: "Page load threshold (ms)",
      description:
        "Report a slow-op when first content paint takes longer than this (measured client-side in a post-paint frame).",
    }),
    elementMs: intField({
      default: 1000,
      min: 0,
      label: "Element appearance threshold (ms)",
      description:
        "Report a slow-op when a live-state resource takes longer than this to settle (mount → first data).",
    }),
    loaderMs: intField({
      default: 2000,
      min: 0,
      label: "Loader threshold (ms)",
      description:
        "Report a slow-op when a server resource loader span exceeds this duration.",
    }),
    httpMs: intField({
      default: 2000,
      min: 0,
      label: "HTTP threshold (ms)",
      description:
        "Report a slow-op when a server HTTP request span exceeds this duration.",
    }),
    dbMs: intField({
      default: 500,
      min: 0,
      label: "DB query threshold (ms)",
      description:
        "Report a slow-op when a database query span exceeds this duration.",
    }),
  },
});
