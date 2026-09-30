import { defineConfig } from "@plugins/config_v2/core";
import { enumField } from "@plugins/fields/plugins/enum/plugins/config/core";
import {
  AnalysisDeviceSchema,
  BeatModelSchema,
  ChromaVariantSchema,
  type AnalysisDevice,
  type BeatModel,
  type ChromaVariant,
} from "../core";

const DEVICE_LABEL: Record<AnalysisDevice, string> = {
  auto: "Auto (the GPU when there is one, else the CPU)",
  cpu: "CPU",
  mps: "GPU (Apple MPS)",
};

const BEAT_MODEL_LABEL: Record<BeatModel, string> = {
  final0: "Full (the paper's main model; the most reliable downbeats)",
  small0: "Small (faster; misplaces more downbeats on sparse songs)",
};

const CHROMA_LABEL: Record<ChromaVariant, string> = {
  fast: "Fast (46 ms frames, tuning from a quarter of them)",
  full: "Full (23 ms frames, tuning from all of them)",
};

/**
 * How beat features are computed. `beatModel` and `chroma` change the output,
 * so each combination is cached apart (`settingsKey`) and switching back
 * reuses what was computed before; `device` only changes the speed.
 */
export const audioAnalysisConfig = defineConfig({
  fields: {
    device: enumField({
      label: "Beat tracker device",
      description:
        "Where the Beat This! beat tracker runs. The output is the same on either; the GPU is several times faster.",
      options: AnalysisDeviceSchema.options.map((value) => ({
        value,
        label: DEVICE_LABEL[value],
      })),
      default: "auto",
    }),
    beatModel: enumField({
      label: "Beat tracker model",
      description:
        "Which Beat This! checkpoint tracks beats and downbeats. Features computed with each model are cached separately.",
      options: BeatModelSchema.options.map((value) => ({
        value,
        label: BEAT_MODEL_LABEL[value],
      })),
      default: "final0",
    }),
    chroma: enumField({
      label: "Chroma",
      description:
        "How the per-beat pitch-class profiles (treble and bass) are computed. Both compensate tuning. Features computed with each are cached separately.",
      options: ChromaVariantSchema.options.map((value) => ({
        value,
        label: CHROMA_LABEL[value],
      })),
      default: "fast",
    }),
  },
});
