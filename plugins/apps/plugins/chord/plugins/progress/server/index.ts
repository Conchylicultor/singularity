import {
  Resource,
  type ServerPluginDefinition,
} from "@plugins/framework/plugins/server-core/core";
import { recordRoundEndpoint } from "../core";
import { handleRecordRound } from "./internal/handlers";
import { chordProgressServerResource } from "./internal/resource";

export default {
  description:
    "Chord progress: the chord_rounds / chord_answers history, the endpoint that saves a checked round, and the live chord.progress stats (each chord's last 20 answers against the mastery rule, today in the learner's time zone, all time).",
  httpRoutes: {
    [recordRoundEndpoint.route]: handleRecordRound,
  },
  contributions: [
    // Both tables are kept in forks, backups and the change feed on purpose (no
    // ExcludeFromFork / ExcludeFromBackup / ExcludeFromChangeFeed): they are the
    // learner's history, which nothing can rebuild, and the feed is what pushes
    // `chord.progress`. No growth bound: rows are written only when a person
    // checks a round. See CLAUDE.md.
    Resource.Declare(chordProgressServerResource),
  ],
} satisfies ServerPluginDefinition;
