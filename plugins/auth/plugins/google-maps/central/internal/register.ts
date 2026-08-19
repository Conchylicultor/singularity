import { registerAuthProvider } from "@plugins/auth/central";
import { googleMapsDescriptor } from "./descriptor";

export const googleMapsAuthRegistration =
  registerAuthProvider(googleMapsDescriptor);
