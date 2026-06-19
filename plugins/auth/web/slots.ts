import type { ComponentType } from "react";
import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";

export interface AuthProviderRowProps {
  providerId: string;
}

export interface AuthProviderContribution {
  id: string;
  name: string;
  icon: ComponentType<{ className?: string }>;
  /** Optional override for the per-provider row in the Accounts pane. */
  rowComponent?: ComponentType<AuthProviderRowProps>;
  /** Optional setup help text shown when credentials are missing. */
  helpUrl?: string;
  /** Optional callback to override the "Configure credentials" button action. */
  configureCredentials?: () => void;
}

export interface AuthScopeRequirement {
  providerId: string;
  scopes: string[];
  reason: string;
  useEnabled?: () => boolean;
}

export const Auth = {
  /**
   * Provider sub-plugins contribute here so the Accounts pane knows about them.
   * The web-side contribution is purely presentational; provider behavior
   * (OAuth URLs, identity fetch) lives in the server-side descriptor.
   */
  Provider: defineSlot<AuthProviderContribution>("auth.provider", {
    docLabel: (p) => p.name,
  }),
  /**
   * Consumer plugins declare the OAuth scopes they need from a provider here.
   * The Accounts pane aggregates requirements per provider, diffs against the
   * granted scopes, and surfaces a "Grant access" affordance for missing ones.
   */
  ScopeRequirement: defineSlot<AuthScopeRequirement>("auth.scope-requirement", {
    docLabel: (r) => r.reason,
  }),
};
