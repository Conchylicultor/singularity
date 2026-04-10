import { getChannelIds } from "./registry";

export function handleChannels(_req: Request): Response {
  return Response.json({ channels: getChannelIds() });
}
