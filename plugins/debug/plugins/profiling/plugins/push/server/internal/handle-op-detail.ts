import { readOpRecords } from "@plugins/debug/plugins/profiling/plugins/op-log/server";
import { HttpError, implement } from "@plugins/infra/plugins/endpoints/server";
import { getOpDetail, type OpDetail } from "../../shared/endpoints";

export const handleOpDetail = implement(getOpDetail, ({ params }) => {
  const opId = params.opId;
  if (!opId) throw new HttpError(400, "Missing opId");

  const record = readOpRecords().find((r) => r.opId === opId);
  if (!record) throw new HttpError(404, "Op not found");

  // `OpRecord` is the read model: total by construction, every field resolved.
  // The detail wire shape IS that record, so it is returned whole rather than
  // re-projected field by field — and this assignment is what makes a field
  // added to `OpRecord` but missing from `OpDetailSchema` a tsc error here.
  const detail: OpDetail = record;
  return detail;
});
