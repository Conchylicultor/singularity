import { registerAuthProvider } from "@plugins/auth/central";
import { googleDescriptor } from "./descriptor";

// Side-effect import: runs on first central-side import of `auth-google`.
registerAuthProvider(googleDescriptor);
