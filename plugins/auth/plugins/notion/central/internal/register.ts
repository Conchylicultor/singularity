import { registerAuthProvider } from "@plugins/auth/central";
import { notionDescriptor } from "./descriptor";

export const notionAuthRegistration = registerAuthProvider(notionDescriptor);
