import {
  defineAuthProvider,
  AuthCredentialsMissingError,
  type AuthIdentity,
  type AuthProviderDescriptor,
} from "@plugins/auth/shared";
import { readGlobalConfig } from "@plugins/auth/central";
import { notionAuthConfig } from "../../shared";

interface NotionMe {
  bot?: {
    owner?: { user?: { id?: string; name?: string; person?: { email?: string } } };
  };
  id?: string;
  name?: string;
}

async function fetchNotionIdentity(
  accessToken: string,
): Promise<AuthIdentity> {
  const res = await fetch("https://api.notion.com/v1/users/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Notion-Version": "2022-06-28",
    },
  });
  if (!res.ok) {
    throw new Error(
      `notion: users/me ${res.status} ${await res.text().catch(() => "")}`,
    );
  }
  const me = (await res.json()) as NotionMe;
  const owner = me.bot?.owner?.user;
  return {
    accountId: owner?.id ?? me.id ?? "primary",
    email: owner?.person?.email,
    displayName: owner?.name ?? me.name,
  };
}

/**
 * SCAFFOLD: descriptor wires up the standard endpoints but is otherwise
 * untested end-to-end. Surfaces in the Accounts pane so users can see the
 * provider exists; clicking Connect will start the real flow once a Notion
 * integration client is registered.
 */
export const notionDescriptor: AuthProviderDescriptor = defineAuthProvider({
  id: "notion",
  name: "Notion",
  kind: "oauth2",
  oauth: {
    authorizeUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    defaultScopes: [],
    pkce: false, // Notion's web integration model uses client_secret, not PKCE.
    buildAuthorizeParams: () => ({
      owner: "user",
    }),
    fetchIdentity: fetchNotionIdentity,
    resolveCredentials: async (env) => {
      const idFromEnv = env.get("SINGULARITY_AUTH_NOTION_CLIENT_ID");
      const secretFromEnv = env.get("SINGULARITY_AUTH_NOTION_CLIENT_SECRET");
      if (idFromEnv && secretFromEnv) {
        return { clientId: idFromEnv, clientSecret: secretFromEnv };
      }
      const cfg = await readGlobalConfig("auth-notion", notionAuthConfig);
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard; readGlobalConfig returns "" for unset secrets
      if (!cfg.clientId || !cfg.clientSecret) {
        throw new AuthCredentialsMissingError("notion");
      }
      return { clientId: cfg.clientId, clientSecret: cfg.clientSecret };
    },
  },
});
