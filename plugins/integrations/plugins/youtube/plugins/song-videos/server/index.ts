import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

// The source registry and the lookup over it. A consumer calls
// `findSongVideos`; a source contributes `SongVideos.Source`.
export { SongVideos } from "./internal/source";
export type { SongVideoSource } from "./internal/source";
export { findSongVideos, SongVideoSourcesFailedError } from "./internal/find";
export type {
  FindOptions,
  SongVideosResult,
  SourceOutcome,
} from "./internal/find";

export default {
  description:
    "Which YouTube videos are this song? The SongVideos.Source contribution (a source's find(query, exec) → answered videos | unavailable) and findSongVideos(query, exec): every source asked at once, their answers merged per video, the ones oEmbed says will not play in an embed dropped (and untitled ones named from oEmbed), the rest ranked towards the studio recording. Names no source.",
} satisfies ServerPluginDefinition;
