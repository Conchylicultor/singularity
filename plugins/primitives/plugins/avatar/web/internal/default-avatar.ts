import { parseSavedSymbolName } from "@plugins/ui/plugins/icons/plugins/saved-names/core";
import type { AvatarSpec } from "../components/avatar-picker";

/** The avatar an agent shows until one is picked: a robot arm on violet. */
export const DEFAULT_AGENT_AVATAR: {
  readonly icon: NonNullable<AvatarSpec["icon"]>;
  readonly color: string;
} = {
  icon: parseSavedSymbolName("precision-manufacturing"),
  color: "violet",
};
