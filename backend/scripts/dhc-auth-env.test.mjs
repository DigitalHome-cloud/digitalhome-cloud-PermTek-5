// The DHC pool lookup's choices, without AWS:  node --test backend/scripts/dhc-auth-env.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { groupRolePrefix, resolve } from "./dhc-auth-env.mjs";

const ARN = "arn:aws:cloudformation:eu-central-1:000000000000:stack/amplify-core-stage-branch-x/abc";
const OUTPUTS = [
  { OutputKey: "userPoolId", OutputValue: "eu-central-1_POOL" },
  { OutputKey: "webClientId", OutputValue: "client" },
  { OutputKey: "identityPoolId", OutputValue: "eu-central-1:idp" },
];
const role = (logical, name) => ({ ResourceType: "AWS::IAM::Role", LogicalResourceId: logical, PhysicalResourceId: name });
const AUTH = [
  role("amplifyAuthauthenticatedUserRoleD8DA3689", "core-authRole"),
  role("amplifyAuthunauthenticatedUserRole2B524D9E", "core-unauthRole"),
  role("amplifyAuthdhcwelcomeGroupRole1A2B3C4D", "core-welcome"),
  role("amplifyAuthdhcadminsGroupRole3BA90153", "core-admins"),
  { ResourceType: "AWS::Cognito::UserPoolGroup", LogicalResourceId: "amplifyAuthdhcadminsGroup35BEE849", PhysicalResourceId: "dhc-admins" },
];

test("the group role prefix drops what Amplify drops", () => {
  assert.equal(groupRolePrefix("dhc-admins"), "amplifyAuthdhcadminsGroupRole");
});

test("resolves the pool, client, identity pool and the three roles", () => {
  const { env, region } = resolve(ARN, OUTPUTS, AUTH);
  assert.equal(region, "eu-central-1");
  assert.deepEqual(env, {
    DHC_USER_POOL_ID: "eu-central-1_POOL",
    DHC_USER_POOL_CLIENT_ID: "client",
    DHC_IDENTITY_POOL_ID: "eu-central-1:idp",
    DHC_AUTH_ROLE_ARN: "arn:aws:iam::000000000000:role/core-authRole",
    DHC_UNAUTH_ROLE_ARN: "arn:aws:iam::000000000000:role/core-unauthRole",
    DHC_ADMINS_GROUP_ROLE_ARN: "arn:aws:iam::000000000000:role/core-admins",
  });
});

test("refuses a core stack without auth outputs or the admins role", () => {
  assert.throws(() => resolve(ARN, OUTPUTS.slice(1), AUTH), /userPoolId/);
  assert.throws(() => resolve(ARN, OUTPUTS, AUTH.filter((r) => r.PhysicalResourceId !== "core-admins")), /dhcadminsGroupRole/);
});
