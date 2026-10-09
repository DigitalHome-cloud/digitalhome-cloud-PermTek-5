#!/usr/bin/env node
// Find the DigitalHome.Cloud user pool from the DHC core backend, at deploy time.
//
//   eval "$(node backend/scripts/dhc-auth-env.mjs)"      # then: ampx pipeline-deploy / ampx sandbox
//
// PermTek-5 signs in through the pool DHC core defines (docs/adr/0008). Rather
// than keep copies of its identifiers, it asks the core backend which pool it
// deployed: AMPLIFY_BACKEND_APP_ID / AMPLIFY_BACKEND_APP_BRANCH name the core's
// Amplify app and branch (the same two variables the DHC frontends use). From
// that branch's CloudFormation stack it reads the pool, the web client, the
// identity pool, the identity pool's two roles and the dhc-admins group role,
// and prints them as DHC_* exports for backend/amplify/auth/resource.ts.
//
// Only Amplify and CloudFormation reads on the core's own stacks: the same kind
// of access `ampx` needs to deploy. Nothing is written anywhere; stdout is meant
// for `eval`, a one-line summary (no ARNs) goes to stderr.

import { AmplifyClient, GetBranchCommand } from "@aws-sdk/client-amplify";
import {
  CloudFormationClient,
  DescribeStacksCommand,
  ListStackResourcesCommand,
} from "@aws-sdk/client-cloudformation";

export const OPERATOR_GROUP = "dhc-admins";

function fail(msg) {
  console.error(`dhc-auth-env: ${msg}`);
  process.exit(1);
}

/** "dhc-admins" -> "dhcadmins", as Amplify names a group's role in the auth stack. */
export function groupRolePrefix(group) {
  return `amplifyAuth${group.replace(/[^A-Za-z0-9]/g, "")}GroupRole`;
}

/** Pick the identifiers out of the core stack's outputs and its auth stack's resources. */
export function resolve(stackArn, outputs, authResources, group = OPERATOR_GROUP) {
  const [, , , region, account] = stackArn.split(":");
  const out = Object.fromEntries(outputs.map((o) => [o.OutputKey, o.OutputValue]));
  for (const key of ["userPoolId", "webClientId", "identityPoolId"]) {
    if (!out[key]) throw new Error(`the core stack has no output ${key}`);
  }
  const role = (prefix) => {
    const r = authResources.find((x) => x.ResourceType === "AWS::IAM::Role" && x.LogicalResourceId.startsWith(prefix));
    if (!r) throw new Error(`the core's auth stack has no role ${prefix}*`);
    return `arn:aws:iam::${account}:role/${r.PhysicalResourceId}`;
  };
  return {
    region,
    env: {
      DHC_USER_POOL_ID: out.userPoolId,
      DHC_USER_POOL_CLIENT_ID: out.webClientId,
      DHC_IDENTITY_POOL_ID: out.identityPoolId,
      DHC_AUTH_ROLE_ARN: role("amplifyAuthauthenticatedUserRole"),
      DHC_UNAUTH_ROLE_ARN: role("amplifyAuthunauthenticatedUserRole"),
      DHC_ADMINS_GROUP_ROLE_ARN: role(groupRolePrefix(group)),
    },
  };
}

async function allResources(cfn, stackName) {
  const out = [];
  let NextToken;
  do {
    const page = await cfn.send(new ListStackResourcesCommand({ StackName: stackName, NextToken }));
    out.push(...(page.StackResourceSummaries ?? []));
    NextToken = page.NextToken;
  } while (NextToken);
  return out;
}

async function main() {
  const appId = process.env.AMPLIFY_BACKEND_APP_ID;
  const branch = process.env.AMPLIFY_BACKEND_APP_BRANCH;
  if (!appId || !branch) {
    fail("set AMPLIFY_BACKEND_APP_ID and AMPLIFY_BACKEND_APP_BRANCH to the DHC core app and branch (docs/setup/shared-auth.md)");
  }
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "eu-central-1";
  const amplify = new AmplifyClient({ region });
  const b = await amplify.send(new GetBranchCommand({ appId, branchName: branch }));
  const stackArn = b.branch?.backend?.stackArn;
  if (!stackArn) fail(`core app ${appId} branch ${branch} has no deployed backend`);

  const cfn = new CloudFormationClient({ region: stackArn.split(":")[3] });
  const stack = (await cfn.send(new DescribeStacksCommand({ StackName: stackArn }))).Stacks?.[0];
  const root = await allResources(cfn, stackArn);
  const authStack = root.find((r) => r.ResourceType === "AWS::CloudFormation::Stack" && r.LogicalResourceId.startsWith("auth"));
  if (!authStack) fail("the core stack has no nested auth stack");
  const auth = await allResources(cfn, authStack.PhysicalResourceId);

  const { env } = resolve(stackArn, stack?.Outputs ?? [], auth);
  for (const [k, v] of Object.entries(env)) {
    console.log(`export ${k}='${v.replace(/'/g, "")}'`);
  }
  console.error(`dhc-auth-env: signing in through user pool ${env.DHC_USER_POOL_ID} of core app ${appId} (${branch})`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => fail(e.message || String(e)));
}
