import { runBuild } from "./run-build";

export async function handleBuild(_req: Request): Promise<Response> {
  const exitCode = await runBuild("manual");
  return Response.json({ exitCode });
}
