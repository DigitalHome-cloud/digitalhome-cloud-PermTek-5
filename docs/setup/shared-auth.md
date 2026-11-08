# Setup: sign-in through the DigitalHome.Cloud user pool

PermTek-5 has no user pool of its own. `backend/amplify/auth/resource.ts`
references the pool DHC core defines (ADR 0008), so one account works across
Portal, Designer, Modeler and PermTek-5.

## How the pool is found

Nothing about the pool is kept in this repository or in PermTek-5's settings.
Right before each deploy, `backend/scripts/dhc-auth-env.mjs` asks the **DHC core
backend** which pool it deployed, and exports what `referenceAuth` needs:

| Exported | From the core backend |
|---|---|
| `DHC_USER_POOL_ID`, `DHC_USER_POOL_CLIENT_ID`, `DHC_IDENTITY_POOL_ID` | outputs `userPoolId`, `webClientId`, `identityPoolId` of the core branch's stack |
| `DHC_AUTH_ROLE_ARN`, `DHC_UNAUTH_ROLE_ARN` | the identity pool's two roles, in the core's auth stack |
| `DHC_ADMINS_GROUP_ROLE_ARN` | the `dhc-admins` group's role, in the core's auth stack |

It reads only Amplify and CloudFormation (the core's own `amplify-*` stacks).
The core is named by two variables, the same ones the DHC frontends use:

| Variable | Value |
|---|---|
| `AMPLIFY_BACKEND_APP_ID` | the Amplify app id of `digitalhome-cloud-core` |
| `AMPLIFY_BACKEND_APP_BRANCH` | its deployed branch (`stage`) |

The same lookup names DHC core's **API and bucket** (outputs
`awsAppsyncApiEndpoint`, `bucketName`, `storageRegion`) as `DHC_CORE_API_URL`,
`DHC_CORE_BUCKET`, `DHC_CORE_REGION`. The `tenants` function asks the core API
whether the caller owns a home (`startForHome`), and the site reads the home's
area and its weather gold in place, as the signed-in person (ADR 0015). They
reach the site as `custom.dhcCore` in the outputs; when empty, the habitat
page shows no climate and nothing else changes.

## Where they go

- **Hosted branches** (`main`, `stage`): environment variables of the Amplify app
  `digitalhome-cloud-PermTek-5`, at app level (both branches use the one DHC
  pool). `amplify.yml` runs the lookup before `ampx pipeline-deploy`.
- **A sandbox**: export them in the shell (or `set -a; source .env.local; set +a`);
  `npm run dev` runs the lookup before `ampx sandbox`. To run `ampx` by hand:
  `eval "$(node backend/scripts/dhc-auth-env.mjs)"` first.

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
