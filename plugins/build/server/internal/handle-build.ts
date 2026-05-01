import { runBuild } from "./run-build";

export async function handleBuild(_req: Request): Promise<Response> {
  const exitCode = await runBuild();
  return Response.json({ exitCode });
}
