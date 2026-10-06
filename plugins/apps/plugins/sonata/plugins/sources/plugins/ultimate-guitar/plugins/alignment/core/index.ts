// Pure, web-safe: the alignment record (contract 2), the aligner, the aligned
// Score builder and the endpoint contracts. The job, table and live resource
// are `server/`.
export {
  ALIGNER_VERSION,
  AlignmentRecordSchema,
  AlignmentSegmentSchema,
  WEAK_MATCH_THRESHOLD,
  sheetHash,
} from "./internal/record";
export type { AlignmentSegment } from "./internal/record";

// The aligner (sheet × beat features → record) and the record → Score builder
// the UG compile() applies when `isApplicable`.
export { alignChords } from "./internal/align";
export { alignedScore, isApplicable } from "./internal/aligned-score";

// The UG source's raw ({ tab, alignment }), the side-table row and the endpoint
// contracts — the integration surface the UG source and the alignment
// server / web halves share.
export { appliedAlignment, UgSourceRawSchema } from "./internal/source-raw";
export type { UgSourceRaw } from "./internal/source-raw";
export {
  AlignmentPhaseSchema,
  AlignmentStatusSchema,
  UgAlignmentRowSchema,
  ugAlignmentShape,
} from "./internal/row";
export type {
  AlignmentPhase,
  AlignmentStatus,
  UgAlignmentRow,
} from "./internal/row";
export {
  getUgAlignment,
  realignUg,
  setUgAlignmentVideo,
} from "./internal/endpoints";
