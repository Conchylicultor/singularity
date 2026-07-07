export {
  editYDocState,
  readYDoc,
  yDocContent,
  yDocFromLexical,
  Y_DOC_CONTENT_KEY,
} from "./internal/headless-collab";
export type { HeadlessCollabOptions } from "./internal/headless-collab";
// NOTE: `bytea` is exported from this plugin's SERVER barrel, not here — schema
// files (tables.ts) must import it without pulling the Lexical bridge, whose
// async module graph breaks drizzle-kit's synchronous schema loader.
