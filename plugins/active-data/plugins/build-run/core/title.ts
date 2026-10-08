/**
 * What a build run is called where its id is named: `Build <short commit>`
 * (or `Build` when the run recorded no commit). One spelling for the chip and
 * for the text a model reads.
 */
export function buildRunTitle(run: { commitHash: string | null }): string {
  return run.commitHash ? `Build ${run.commitHash.slice(0, 7)}` : "Build";
}
