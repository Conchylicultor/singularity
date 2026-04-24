import { registerAuthProvider } from "@plugins/auth/server";
import { notionDescriptor } from "./descriptor";

registerAuthProvider(notionDescriptor);
