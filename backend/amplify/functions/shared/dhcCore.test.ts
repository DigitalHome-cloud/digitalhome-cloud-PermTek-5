import { test } from "node:test";
import assert from "node:assert/strict";
import { HOME_ID, areaOf, homeAsCaller, ownsHome } from "./dhcCore";

// startForHome asks DHC core, with the caller's own token, whether they may see
// the home (docs/adr/0015). Core's rules decide; these check how the answer is read.

const API = "https://core.example/graphql";
const reply = (body: unknown, ok = true) =>
  (async (_url: unknown, init?: RequestInit) => {
    reply.last = init;
    return { ok, json: async () => body } as Response;
  }) as typeof fetch;
reply.last = undefined as RequestInit | undefined;

test("an owner gets the home back, asked with their own token", async () => {
  const home = { smartHomeId: "BE-DEMO", country: "BE", postalCode: "1000", isDemo: true };
  const got = await homeAsCaller("BE-DEMO", "caller-id-token", API, reply({ data: { getDigitalHome: home } }));
  assert.deepEqual(got, home);
  assert.equal((reply.last?.headers as Record<string, string>).authorization, "caller-id-token");
  assert.match(String(reply.last?.body), /getDigitalHome/);
});

test("anyone else gets nothing: core hides the home, errs, or there is no token", async () => {
  assert.equal(await homeAsCaller("BE-DEMO", "t", API, reply({ data: { getDigitalHome: null } })), null);
  assert.equal(await homeAsCaller("BE-DEMO", "t", API, reply({ data: null, errors: [{ message: "Not Authorized" }] })), null);
  assert.equal(await homeAsCaller("BE-DEMO", "t", API, reply({}, false)), null);
  assert.equal(await homeAsCaller("BE-DEMO", undefined, API, reply({ data: { getDigitalHome: {} } })), null);
});

test("without the core API it fails loudly rather than letting anyone in", async () => {
  await assert.rejects(homeAsCaller("BE-DEMO", "t", "", reply({})), /DHC_CORE_API_URL/);
});

test("home ids as DHC mints them", () => {
  for (const ok of ["DE-80331-MAR12-01", "BE-1000-RUE1-01", "BE-DEMO"]) assert.ok(HOME_ID.test(ok), ok);
  for (const bad of ["", "be-demo", "BE", "DE-80331-MAR12-01-02-03", "BE-DEMO\n", "t-aaaaaaaaaa"]) assert.ok(!HOME_ID.test(bad), bad);
  assert.equal(areaOf({ country: "BE", postalCode: "1000" }), "BE-1000");
});

test("an operator sees every home but owns none of them", () => {
  const home = { smartHomeId: "BE-1000-RUE1-01", country: "BE", postalCode: "1000", owners: ["sub-owner"] };
  assert.ok(ownsHome(home, "sub-owner"));
  assert.ok(ownsHome(home, undefined, "sub-owner"));
  assert.ok(!ownsHome(home, "sub-operator", "sub-operator"));
  assert.ok(!ownsHome({ ...home, owners: null }, "sub-owner"));
  assert.ok(!ownsHome(home, undefined, undefined));
});
