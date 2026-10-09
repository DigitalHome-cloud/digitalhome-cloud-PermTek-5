# Setup: sign-in through the DigitalHome.Cloud user pool

PermTek-5 has no user pool of its own. `backend/amplify/auth/resource.ts`
references the pool DHC core defines (ADR 0008), so one account works across
Portal, Designer, Modeler and PermTek-5. The backend needs six identifiers of
that pool at synth time. They are **not committed** (this repository is public
and ARNs carry the account number); they come from the environment.

## The six variables

| Variable | What | Where it comes from |
|---|---|---|
| `DHC_USER_POOL_ID` | the user pool | DHC core's deployed outputs (`auth.user_pool_id`) |
| `DHC_USER_POOL_CLIENT_ID` | the web app client the DHC apps use | `auth.user_pool_client_id` |
| `DHC_IDENTITY_POOL_ID` | the identity pool | `auth.identity_pool_id` |
| `DHC_AUTH_ROLE_ARN` | the identity pool's authenticated role | the identity pool's roles |
| `DHC_UNAUTH_ROLE_ARN` | its unauthenticated role | the identity pool's roles |
| `DHC_ADMINS_GROUP_ROLE_ARN` | the IAM role of the `dhc-admins` group | the group |

Read them with the AWS CLI (credentials of the DHC account):

```bash
# the pool, client and identity pool: from DHC core's deployed outputs
npx ampx generate outputs --app-id <core app id> --branch stage --out-dir /tmp/dhc-core
jq -r '.auth | .user_pool_id, .user_pool_client_id, .identity_pool_id' /tmp/dhc-core/amplify_outputs.json

# the identity pool's roles
aws cognito-identity get-identity-pool-roles --identity-pool-id <identity pool id> \
  --query 'Roles.[authenticated, unauthenticated]' --output text

# the dhc-admins group's role
aws cognito-idp get-group --user-pool-id <user pool id> --group-name dhc-admins --query 'Group.RoleArn' --output text
```

## Where they go

- **Hosted branches** (`main`, `stage`): environment variables of the Amplify
  app `digitalhome-cloud-PermTek-5`, at app level (both branches use the one
  DHC pool): `aws amplify update-app --app-id <app id> --environment-variables …`
  or the console (App settings → Environment variables).
- **A sandbox**: export them in the shell (or `set -a; source .env.local; set +a`)
  before `npm run dev` / `npx ampx sandbox`.

## What referencing the pool does to it

- Nothing to the pool's settings: those are DHC core's (MFA OPTIONAL with TOTP,
  open sign-up, the adminMfaGate trigger).
- PermTek-5's storage and data permissions are attached as IAM policies to the
  identity pool's authenticated role and to the `dhc-admins` group role. They
  belong to PermTek-5's stack and go with it; they only grant what PermTek-5's
  rules say (by tenant and space group, ADR-0005).
- The `tenants` function creates `t-…`/`s-…` groups in the shared pool at
  runtime. They do not collide with DHC's groups (`dhc-*`, per-home `DE-…` etc.).

Tenant admins and operators need two-step sign-in, which the DHC pool offers
once DHC core PR #12 is deployed. Before that, PermTek-5's admin screens refuse.
