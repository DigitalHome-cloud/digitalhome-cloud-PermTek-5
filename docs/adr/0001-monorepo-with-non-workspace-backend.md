# ADR-0001 — A monorepo whose backend is not a workspace

Status: **Accepted** · Date: 2026-08-28

## Context

The repository holds a Gatsby 5 site, a pure-TypeScript domain package and an
AWS Amplify Gen 2 backend. npm workspaces is the obvious way to hold three
packages together, and the obvious thing is to make all three workspaces.

It does not work. Gatsby 5 needs **graphql 16**. The Amplify Gen 2 data
construct needs **graphql 15**. npm workspaces hoists a single copy to the root
`node_modules`, and one hoisted tree cannot satisfy both.

The failure is not a clear version error. Whichever copy npm hoists is what
`graphql-compose` resolves at build time, and if 15 wins, `gatsby build` dies
inside `buildSchema` with:

> Cannot create as TypeComposer … GraphQLScalarType(Date)

which names neither graphql nor Amplify, and points at Gatsby's schema
builder — a place where nothing is wrong.

## Decision

`backend/` is **not** an npm workspace. It has its own `package.json`, its own
`package-lock.json` and its own `node_modules`, installed separately:

```bash
npm install && npm --prefix backend install
```

And, as the other half of the same decision, **`graphql: ^16` is named as a
direct dependency of `packages/site`**, even though nothing there imports it.
`aws-amplify` v6 drags graphql 15 in transitively; naming 16 explicitly is what
makes npm hoist 16 deterministically instead of by accident of resolution
order.

## Consequences

- Two installs, two lockfiles. `amplify.yml` runs both, in the right phases.
- The site's TypeScript program must never reach into `backend/`. Importing
  `Schema` from `backend/amplify/data/resource` pulls `@aws-amplify/backend`
  and graphql 15 back in, undoing all of this. The AppSync client in
  `packages/site/src/lib/data.ts` is therefore untyped and its result shapes
  hand-written, kept in step with `data/resource.ts` by hand. Verify with:

  ```bash
  npx tsc --noEmit -p packages/site/tsconfig.json --listFiles \
    | grep -c '@aws-amplify/backend/'      # must be 0
  ```

- `graphql: ^16` in `packages/site/package.json` looks like an unused
  dependency and will survive any `depcheck`-style cleanup only if someone
  reads the comment. Do not remove it.
- The backend's install uses `npm install`, not `npm ci` — see the comment in
  `amplify.yml`, which explains the EUSAGE failure that makes `ci` unusable
  against a lockfile npm itself just wrote.
- Shared code between the site and a Lambda has to live in `packages/core`,
  which has no dependencies at all, and be consumed by the backend as a
  published or vendored artefact rather than a workspace link. Nothing does
  that yet; when something does, this is the constraint it must satisfy.
