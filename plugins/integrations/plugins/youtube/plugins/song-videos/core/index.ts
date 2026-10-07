// Pure, runtime-neutral: the question ("which YouTube videos are this song?"),
// a source's answer, the merged candidate, and how candidates are ranked. The
// source registry and the lookup that fans out to it are `server/`.
export { mergeSourceAnswers, SongQuerySchema } from "./internal/candidate";
export type {
  CandidateSource,
  SongQuery,
  SourceAnswer,
  SourceVideo,
  VideoCandidate,
  VideoEvidence,
} from "./internal/candidate";
export { normalizeSongKey } from "./internal/song-key";
export { rankCandidates } from "./internal/rank";
export type { RankedCandidate } from "./internal/rank";
