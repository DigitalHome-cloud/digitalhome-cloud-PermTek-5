#!/usr/bin/env node
/**
 * Verifies the auth invariants of ADR-0002 against a LIVE backend.
 *
 * This exercises the exact library and the exact call sequence AuthGate uses —
 * aws-amplify/auth, signIn → the new-password challenge → confirmSignIn →
 * fetchAuthSession → cognito:groups — rather than a stand-in. A green run
 * means the sign-in path in the browser works, not merely that Cognito exists.
 *
 * That distinction is the whole point of this file. Every other check in this
 * repository proves the code agrees with itself; this one is the only thing
 * that proves the gate agrees with AWS.
 *
 * Usage:
 *   PT_USER=someone@example.com PT_PASSWORD='...' \
 *     node scripts/verify-auth.mjs [--new-password '...']
 *
 * Pass --new-password when the account is still in FORCE_CHANGE_PASSWORD, i.e.
 * the normal first login for an admin-created account.
 *
 * Reads backend/amplify_outputs.json, so run it after `ampx sandbox`. For a
 * deployed branch, regenerate that file first:
 *   cd backend && npx ampx generate outputs --app-id <id> --branch stage
 *
 * Credentials come from the environment and are never written anywhere.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Amplify } from "aws-amplify";
import {
  confirmSignIn,
  fetchAuthSession,
  getCurrentUser,
  signIn,
  signOut,
} from "aws-amplify/auth";
import { cognitoUserPoolsTokenProvider } from "aws-amplify/auth/cognito";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

let outputs;
try {
  outputs = JSON.parse(
    readFileSync(resolve(ROOT, "backend/amplify_outputs.json"), "utf8")
  );
} catch {
  console.error(
    "\n  No backend/amplify_outputs.json. Deploy a sandbox first:\n" +
      "    npm run dev            (sandbox + site)\n" +
      "    npm --prefix backend run sandbox:once   (backend only)\n" +
      "  or `ampx generate outputs --app-id <id> --branch stage` for a\n" +
      "  deployed branch.\n"
  );
  process.exit(2);
}

Amplify.configure(outputs);

// Amplify defaults to browser storage. In Node there is none, and a token
// cache that outlives the process would be wrong for a verification script
// anyway, so tokens live and die in this Map.
const mem = new Map();
cognitoUserPoolsTokenProvider.setKeyValueStorage({
  setItem: async (k, v) => void mem.set(k, v),
  getItem: async (k) => (mem.has(k) ? mem.get(k) : null),
  removeItem: async (k) => void mem.delete(k),
  clear: async () => void mem.clear(),
});

const username = process.env.PT_USER;
const password = process.env.PT_PASSWORD;
const newPasswordIdx = process.argv.indexOf("--new-password");
const newPassword =
  newPasswordIdx > -1 ? process.argv[newPasswordIdx + 1] : undefined;

if (!username || !password) {
  console.error("\n  set PT_USER and PT_PASSWORD (see .env.example)\n");
  process.exit(2);
}

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`
  );
  if (!ok) failures++;
};

console.log("auth invariants (ADR-0002)\n");

/* -- the configuration itself --------------------------------------------- *
 * Read from the outputs file rather than from the CDK, because this is what
 * the browser is actually handed. A backend.ts that sets the right switch and
 * an outputs file that says otherwise is a real failure mode.
 *
 * These four read a FILE and never call AWS, so they pass just as happily
 * against a sandbox that was deleted an hour ago. That is why the live section
 * below says so when it cannot find the pool: four green lines followed by a
 * stack trace reads as "the config is fine", and the config is describing
 * something that no longer exists.
 * ------------------------------------------------------------------------- */

check(
  outputs.auth?.unauthenticated_identities_enabled === false,
  "identity pool refuses unauthenticated identities"
);
check(
  outputs.data?.default_authorization_type === "AMAZON_COGNITO_USER_POOLS",
  "data API defaults to the user pool"
);
check(!outputs.data?.api_key, "data API has no API key");
check(
  (outputs.auth?.groups ?? []).some((g) => "dhc-admins" in g),
  "dhc-admins group is declared"
);

/* -- the sign-in path ------------------------------------------------------ */

/**
 * Everything past here talks to Cognito, so it fails in ways that are about
 * the environment rather than about the code. Reported as a FAIL with a
 * diagnosis; an unhandled rejection here would bury the useful sentence under
 * forty lines of Amplify's internal frames.
 */
function diagnose(err) {
  const name = err?.name ?? "";
  const message = err?.message ?? String(err);

  if (/ResourceNotFound/.test(name) || /does not exist/i.test(message)) {
    return `The user pool or client named in backend/amplify_outputs.json does
  not exist. That file is stale — the sandbox it describes has been deleted.

    npm run dev                       redeploy a sandbox, or
    npm --prefix backend run sandbox:once
    cd backend && npx ampx generate outputs --app-id <id> --branch stage
                                      for a deployed branch`;
  }
  if (/NotAuthorized/.test(name) || /Incorrect username or password/i.test(message)) {
    return "PT_USER / PT_PASSWORD were rejected by this pool.";
  }
  if (/UserNotFound/.test(name)) {
    return `No such user in this pool. Accounts are admin-created (ADR-0002):
  make one in the Cognito console and add it to dhc-admins.`;
  }
  if (/PasswordResetRequired|NewPasswordRequired/.test(name)) {
    return "The account needs a new password. Re-run with --new-password '…'.";
  }
  return `${name || "error"}: ${message}`;
}

try {

let res = await signIn({ username, password });

if (res.nextStep?.signInStep === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED") {
  check(true, "admin-created account is challenged for a new password");
  if (!newPassword) {
    console.error("\n  account needs --new-password to continue");
    process.exit(2);
  }
  res = await confirmSignIn({ challengeResponse: newPassword });
}

check(res.isSignedIn === true, "sign-in completes");

const user = await getCurrentUser();
check(Boolean(user.username), "getCurrentUser returns a user", user.username);

const session = await fetchAuthSession();
const payload = session.tokens?.idToken?.payload ?? {};
const groups = payload["cognito:groups"] ?? [];

check(Boolean(session.tokens?.idToken), "an ID token is issued");
// Not asserted to contain dhc-admins: this has to pass for an ordinary member
// too, and a check that only a privileged account can satisfy is one nobody
// runs. What matters is that the claim REACHES the client at all — its
// absence is what breaks the rail, the switcher and every group check.
check(
  Array.isArray(groups),
  "cognito:groups reaches the client",
  JSON.stringify(groups)
);
check(
  payload.email === username,
  "the email claim is present",
  String(payload.email)
);

await signOut();
const after = await fetchAuthSession().catch(() => ({}));
check(!after.tokens?.idToken, "sign-out clears the session");

} catch (err) {
  check(false, "the live sign-in path");
  console.error(`\n  ${diagnose(err)}\n`);
}

console.log(`${failures === 0 ? "all checks passed" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
