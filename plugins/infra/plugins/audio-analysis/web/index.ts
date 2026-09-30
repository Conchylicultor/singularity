import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { audioAnalysisConfig } from "../shared/config";

export default {
  description:
    "The audio-analysis settings registration (beat tracker device and model, chroma variant), so they appear in Settings → Config.",
  contributions: [ConfigV2.WebRegister({ descriptor: audioAnalysisConfig })],
} satisfies PluginDefinition;
