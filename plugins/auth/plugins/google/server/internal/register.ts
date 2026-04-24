import { registerAuthProvider } from "@plugins/auth/server";
import { googleDescriptor } from "./descriptor";

// Side-effect import: runs on first server-side import of `auth-google`.
registerAuthProvider(googleDescriptor);
