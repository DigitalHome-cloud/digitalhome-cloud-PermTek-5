import { referenceAuth } from "@aws-amplify/backend";

/**
 * Sign-in is the DigitalHome.Cloud user pool, shared with the Portal, the
 * Designer and the Modeler: one account across all DigitalHome.Cloud apps
 * (docs/adr/0008). PermTek-5 does NOT own a pool; it references the one DHC
 * core defines (DigitalHome-cloud/digitalhome-cloud-core, amplify/auth).
 *
 * What that pool gives, and what it means here:
 *
 *   - MFA OPTIONAL with TOTP (core PR #12). Members who only look are never
 *     asked; tenant admins and operators must set it up (site: AuthGate;
 *     Lambdas: functions/shared/mfa.ts), exactly as with the template's own pool.
 *   - Operators are `dhc-admins`, the platform admins. DHC core's adminMfaGate
 *     trigger withholds that group from tokens until the person has TOTP.
 *     They create tenants and see names; they read NO tenant content (ADR-0005).
 *   - Self sign-up is OPEN in the DHC pool (new users land in dhc-welcome),
 *     unlike the template's own pool (ADR-0002). A signed-in DHC user sees
 *     nothing in PermTek-5 until a tenant admin adds them to a site's group:
 *     every rule here is by tenant (`t-…`) and space (`s-…`) group, never
 *     "any signed-in user". docs/adr/0008 records the change.
 *   - Tenant and space groups (`t-…`, `s-…`) are created at runtime by the
 *     `tenants` function in the shared pool. They cannot collide with DHC's
 *     groups (`dhc-*`, per-home `DE-…`/`FR-…`/`BE-…`).
 *
 * The pool's identifiers and role ARNs are NOT in this repository (it is
 * public; ARNs carry the account number), and not kept anywhere else either:
 * backend/scripts/dhc-auth-env.mjs looks them up from the DHC core backend
 * (AMPLIFY_BACKEND_APP_ID / AMPLIFY_BACKEND_APP_BRANCH) right before the deploy
 * and exports them as DHC_* for this file. amplify.yml and scripts/dev.sh run
 * it. See docs/setup/shared-auth.md.
 */
function fromEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set: PermTek-5 signs in with the DigitalHome.Cloud user pool, ` +
        `looked up from the DHC core backend by backend/scripts/dhc-auth-env.mjs (see docs/setup/shared-auth.md).`,
    );
  }
  return value;
}

export const OPERATOR_GROUP = "dhc-admins";

export const auth = referenceAuth({
  userPoolId: fromEnv("DHC_USER_POOL_ID"),
  identityPoolId: fromEnv("DHC_IDENTITY_POOL_ID"),
  userPoolClientId: fromEnv("DHC_USER_POOL_CLIENT_ID"),
  authRoleArn: fromEnv("DHC_AUTH_ROLE_ARN"),
  unauthRoleArn: fromEnv("DHC_UNAUTH_ROLE_ARN"),
  // Storage rules for operators (edge releases) need the group's IAM role.
  groups: { [OPERATOR_GROUP]: fromEnv("DHC_ADMINS_GROUP_ROLE_ARN") },
});
