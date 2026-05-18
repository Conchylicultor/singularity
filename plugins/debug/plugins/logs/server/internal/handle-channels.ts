import { implement } from "@plugins/infra/plugins/endpoints/server";
import { getLogChannels } from "../../core/endpoints";
import { getChannelIds } from "./registry";

export const handleChannels = implement(getLogChannels, () => {
  return { channels: getChannelIds() };
});
