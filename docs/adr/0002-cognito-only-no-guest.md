# ADR-0002 — Cognito only, no guest tier, no self-signup

Status: **Accepted** · Date: 2026-08-28

## Context

Applications built on this template hold internal data for a small number of
named people. Two patterns were available:

1. A public marketing surface with an authenticated app behind it.
2. Everything behind authentication, with the landing page *being* the sign-in
   page.

The first is the default shape of most web frameworks, and it produces a
recurring class of bug: a new route is public until someone remembers to guard
it. The DHC Portal grew a copy-pasted `useEffect(() => navigate("/signin"))` in
every page, and the pages that were added without it were not discovered by a
test — they were discovered by someone opening them.

## Decision

**There is no anonymous access.** One gate is mounted at the root, in
`wrapPageElement`, shared by `gatsby-browser` and `gatsby-ssr`. Every page is
behind it by construction; a new page cannot be unprotected.

**There is no self-signup.** Accounts are created by an administrator.
`allowAdminCreateUserOnly` is set on the user pool in `backend.ts` — at the
*pool* level, not hidden in the UI, so it holds even against a direct Cognito
API call. `defineAuth` does not expose that switch, which is why it is CDK.

**There is no guest identity.** `allowUnauthenticatedIdentities` is false, so
the identity pool will not vend credentials to an unauthenticated caller.

It does *not* remove the guest IAM role. `defineAuth` creates an
unauthenticated user role regardless, and this flag does not touch it — checked
against a live sandbox, where the auth stack contains
`amplifyAuthunauthenticatedUserRole` while the pool reports
`AllowUnauthenticatedIdentities=false`. The role is unassumable, because
nothing can obtain credentials for it, and that is the property that matters.
Do not read its presence in the console as a misconfiguration, and do not go
looking for the switch that deletes it — there isn't one short of dropping to
the L1 pool and rebuilding the role attachment.

**One static group, `app-admins`.** Per-tenant groups are `app-<slug>` and are
*not* declared in `defineAuth`: declaring them would mean a backend deploy per
tenant, and `defineStorage`'s rules are static at deploy time and could not
reference them anyway. See ADR-0004.

## Consequences

- `AuthGate` **must** be mounted in `gatsby-ssr` as well as `gatsby-browser`.
  Leaving it out of SSR breaks the build: page components call `useSession()`,
  and Gatsby would render them directly during the static build with no
  provider above them. The gate short-circuits on
  `typeof window === "undefined"` and renders a neutral frame, which is also
  what makes the static artefact contain no authenticated content.
- The build must therefore succeed with **no** `amplify_outputs.json`, because
  a frontend-only rebuild has no backend phase. `AuthGate` renders an explicit
  "backend not configured" notice rather than crashing.
- Onboarding is a manual act: create the user, create the `app-<slug>` group,
  add the user to it. In this template the group is created by hand in the
  Cognito console. Automating it means an admin Lambda that mints the row and
  the group together; add one when the manual step becomes the bottleneck.
- **Adding a user to a group does not change their existing tokens.** They must
  sign out and in, or the app must call
  `fetchAuthSession({ forceRefresh: true })`. This looks like a caching bug
  every single time.
- The new-password challenge is the **normal** first-login path for an
  admin-created account, not an edge case. `SignInForm` handles
  `CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED` for that reason; omitting it
  makes every new user's first sign-in fail with no explanation.
- No SEO, no marketing pages, no sitemap. If a fork needs a public surface, it
  is a second site, not a hole in this one.
