import type { GmailProfile } from "../../core";
import { gmailRequest } from "./request";

export async function getProfile(token: string): Promise<GmailProfile> {
  return gmailRequest<GmailProfile>(token, "/profile");
}
