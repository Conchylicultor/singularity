import { registerAuthProvider } from "@plugins/auth/central";
import { notionDescriptor } from "./descriptor";

registerAuthProvider(notionDescriptor);
