import { registerAuthProvider } from "@plugins/auth/central";
import { hooktheoryDescriptor } from "./descriptor";

export const hooktheoryAuthRegistration =
  registerAuthProvider(hooktheoryDescriptor);
