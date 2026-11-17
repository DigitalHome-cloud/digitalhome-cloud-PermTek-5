// npm test (backend): /edge/v1/care's rules (docs/adr/0031) are the care calendar's, run on the edge's own date.
import assert from "node:assert/strict";
import { test } from "node:test";
import { careState, isPersonTask, readReport, stillPending, type CareReport } from "./care";

const body = { spaceId: "s-abcdefghjk", guildId: "guild-1", today: "2026-10-08", lastDone: { hopper: "2026-10-01" }, active: ["frost"] };

test("a report is read with only what it may say", () => {
  const rep = readReport({ ...body, applied: ["hopper", "Not an id!"], lastDone: { hopper: "2026-10-01", buffer: "soon" } }) as CareReport;
  assert.deepEqual(rep.lastDone, { hopper: "2026-10-01" }, "a date that is no day is dropped");
  assert.deepEqual(rep.applied, ["hopper"]);
  assert.equal(readReport({ ...body, today: "8.10.2026" }), "today must be a day, YYYY-MM-DD");
  assert.equal(readReport({ ...body, spaceId: "" }), "spaceId is required");
});

test("what is due follows the care calendar on the edge's date, for the person and the robot alike", () => {
  const s = careState(readReport(body) as CareReport, new Date("2026-10-17T08:00:00Z"));
  const due = Object.fromEntries(s.due.map((d) => [d.id, d]));
  assert.equal(due.hopper.reason, "rhythm");
  assert.equal(due.hopper.who, "person");
  assert.equal(due.hopper.overdueDays, 0, "every 7 days from Oct 1: due on Oct 8");
  assert.equal(due.wrap.reason, "season", "October: wrap the box for winter");
  assert.equal(due.feed.who, "robot", "the robot's jobs are shown too; they are confirmed on the edge");
  assert.equal(s.reportedAt, "2026-10-17T08:00:00.000Z");
  assert.match(s.guide, /^wormbed5-care@\d+$/);
  assert.ok(s.due.every((d) => d.reason));
});

test("Done presses wait until the edge names them, and only a person's task can be done from the site", () => {
  assert.deepEqual(stillPending(new Set(["wrap", "hopper"]), ["hopper"]), ["wrap"]);
  assert.deepEqual(stillPending(undefined, []), []);
  assert.equal(isPersonTask("hopper"), true);
  assert.equal(isPersonTask("feed"), false);
  assert.equal(isPersonTask("nothing"), false);
});
