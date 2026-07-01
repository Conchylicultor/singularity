// The chord-grid source id now lives in `shared/` so the server create route can
// stamp the same `source` discriminator without a web import. Re-exported here so
// the existing web importers keep their `./constants` path unchanged.
export { CHORD_GRID_SOURCE_ID } from "../shared/constants";
