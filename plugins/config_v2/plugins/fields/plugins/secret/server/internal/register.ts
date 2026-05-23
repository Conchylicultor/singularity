import { registerFieldStorageProvider } from "@plugins/config_v2/server";
import { secretFieldType } from "../../core";
import { secretStorageProvider } from "./storage";

registerFieldStorageProvider(secretFieldType.id, secretStorageProvider);
