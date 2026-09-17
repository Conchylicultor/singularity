import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdInsights } from "react-icons/md";
import { DeploymentDetail } from "@plugins/apps/plugins/deploy/plugins/deployments/web";
import { AnalyticsSection } from "./components/analytics-section";
import { useAnalyticsAvailable } from "./internal/use-analytics-available";

export default {
  description:
    "Analytics section of a deployment's page, shown only when the deployment's composition ships the collect plugin: range and comparison controls, KPI tiles choosing a trend line with a dashed previous period, ranked Pages / Sources / Locations / Devices / Events panels whose rows filter the whole dashboard (one filter on ranges past the raw window), and what one visit records. Reads the report over SSH on demand, with explicit states for every failure.",
  contributions: [
    DeploymentDetail.Section({
      id: "analytics",
      label: "Analytics",
      icon: MdInsights,
      component: AnalyticsSection,
      useAvailable: useAnalyticsAvailable,
    }),
  ],
} satisfies PluginDefinition;
