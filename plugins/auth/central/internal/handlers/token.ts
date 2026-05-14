import type { HttpHandler } from "@central/types";
import { getAccessTokenInternal } from "../token-access";

export const handleGetToken: HttpHandler = async (req) => {
  const body = await req.json();
  const result = await getAccessTokenInternal(body);
  return Response.json(result);
};
