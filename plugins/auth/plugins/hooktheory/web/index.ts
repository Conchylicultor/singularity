import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Auth } from "@plugins/auth/web";
import { MdMusicNote } from "react-icons/md";
import { HOOKTHEORY_PROVIDER_ID, HOOKTHEORY_SIGN_UP_URL } from "../core";

export default {
  description:
    "Hooktheory Accounts row: signs in with a Hooktheory username and password through the shared password sign-in dialog.",
  contributions: [
    Auth.Provider({
      id: HOOKTHEORY_PROVIDER_ID,
      name: "Hooktheory",
      icon: MdMusicNote,
      helpUrl: "https://www.hooktheory.com",
      passwordSignIn: {
        usernameLabel: "Username",
        signUpUrl: HOOKTHEORY_SIGN_UP_URL,
      },
    }),
  ],
} satisfies PluginDefinition;
