export { fixturesCollectedDir } from "./collected";
export { loadFixtures } from "./load-fixtures";
export {
  evaluateInvariant,
  checkNoOverlap,
  checkNoClip,
  checkLeftPack,
  checkRigidIntegrity,
  checkPinnedRight,
  checkNeverTruncatesWhenRoomy,
  checkTruncationOnsetOrder,
} from "./oracle";
export type { OracleResult } from "./oracle";
export { isLayoutFixture } from "./types";
export type {
  FixtureState,
  FixtureDims,
  MeasuredBox,
  MeasuredFixture,
  GeometryInvariant,
  FixtureMutation,
  LayoutFixture,
} from "./types";
