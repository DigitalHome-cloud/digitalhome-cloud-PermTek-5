# ADR 0031: The cloud plans the care, the edge keeps it

Status: **Accepted** · 2026-10-17 · Builds on [ADR 0024](0024-care-calendar.md), [ADR 0029](0029-growing-periods-and-the-beds-target.md) · Amends ADR 0024's consequences

## Context

**The edge's autopilot** (twin edge, a rehearsal only) does a person's part so a run can go unattended. It refills
the hopper, the bedding and the tank, does the person's care tasks that are due, then confirms the robot's
proposals in a fixed order, with the "looking" jobs (scan, probe, photo) once a simulated day. Almost all of it is
standard maintenance, which the care calendar already describes (ADR 0024). But the order and the refill levels
were constants in the edge's code.

**The cloud could not say what is due.** ADR 0024 keeps the care record on the edge, so the site showed the plan
(what each month asks for) but not what is due or overdue at a guild today.

## Decision

1. **The autopilot's policy is data in the care guide.** `wormbed5-care.json` gains an `autopilot` block:
   - `order` of the proposal kinds, most needed first;
   - `daily`: the looking jobs, once a day;
   - `refills`: the levels under which the hopper, the bedding and the tank are refilled;
   - `fills`: what goes in.
   Core reads it with `autopilotPolicy()`, the edge with `maintenance.autopilot_policy()`, each with the same
   defaults. Nothing the autopilot does changes.
2. **The edge reports its care, the cloud works out what is due.**
   - **What the edge sends:** `POST /edge/v1/care` with its care date, when each task was last done, and the
     keeper's reactions. It sends when these change, and at least hourly.
   - **What the cloud does:** it runs `careDue` (core, bundled for the backend like the bed planner) on the
     edge's own date. A twin runs on simulated days. It keeps the result on the edge's registry row: one edge per
     guild (ADR 0020).
   - **What the cloud does not do:** nothing is scheduled, and nothing is written into the space's graph.
3. **The site shows today's care** in the Now view, per guild:
   - the person's chores, with Done;
   - the robot's due jobs;
   - the keeper's reactions;
   - when the guild last reported.
   The space's readers see it. A Done is the tenant's admins' (with two-step sign-in, as for every change of the
   site). It waits on the edge's row until the edge has carried it out and named it back.
4. **Robot jobs are confirmed on the edge, never from the cloud.** The cloud has no channel that moves the robot.
   The garden runs offline (rule 2).
5. **A rehearsal reports nothing.** Like its sowing (ADR 0029), what the twin does in a rehearsal stays in the
   twin.

## Consequences

- **The cloud now sees what is due and overdue at each guild.** The record itself stays on the edge, as ADR 0024
  decided.
- **One set of rules, in one file,** for the edge's autopilot and the site's plan.
- **A Done in the site is not instant.** It reaches the edge on its next report, at most an hour later, and
  sooner when the care changes. The site says "done, waiting for the edge".
- **An edge that stops reporting** shows as quiet after two hours. Nothing is inferred from the silence.
- **Not decided here:** a standing permission for routine robot jobs without a Confirm (per bed, revocable,
  always below the keeper's holds). That is the next step, with its own ADR.
