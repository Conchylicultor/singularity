import { MdFolder } from "react-icons/md";
import { defineFieldType, defineFieldIdentity } from "@plugins/fields/core";

export const directoryPathFieldType = defineFieldType<string>("directory-path");

export const directoryPathIdentity = defineFieldIdentity<string>({
  type: directoryPathFieldType,
  label: "Folder",
  icon: MdFolder,
  // A directory path is just a string; coerce stays pure/total like text's.
  coerce: (v) => (typeof v === "string" ? v : String(v ?? "")),
});
