import { registerAuthProvider } from "@plugins/auth/central";
import { googleDescriptor } from "./descriptor";

export const googleAuthRegistration = registerAuthProvider(googleDescriptor);
