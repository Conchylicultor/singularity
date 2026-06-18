import { MdList } from "react-icons/md";
import {
  defineFieldType,
  defineFieldIdentity,
  type FieldsRecord,
  type InferFieldsObject,
} from "@plugins/fields/core";

export type ListItem<F extends FieldsRecord> = {
  id: string;
  rank: string;
} & InferFieldsObject<F>;

export const listFieldType = defineFieldType<ListItem<FieldsRecord>[]>("list");

export const listIdentity = defineFieldIdentity<ListItem<FieldsRecord>[]>({
  type: listFieldType,
  label: "List",
  icon: MdList,
});
