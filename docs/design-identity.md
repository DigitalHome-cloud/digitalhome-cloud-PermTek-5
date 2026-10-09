# Design identity

The app looks and reads like the DigitalHome.Cloud Portal
(stage-portal.digitalhome.cloud): the same dark palette, the same fonts, the
same four-stage loop on the home page.

**Source of truth** (do not copy values into other docs):
- `digitalhome-cloud-darkfactory/repos/portal/src/styles/overview.css` (the `.ov` theme)
- `digitalhome-cloud-darkfactory/repos/portal/src/components/OverviewLoop.js` (the loop hero)

## Mapping onto the cloud template

template-dlab5-cloud keeps its token names (`packages/site/src/styles/tokens.css`,
`--app-*`, dark-first). permaculture-cloud sets them from the Portal's `--ov-*` values:

| Template token | Portal token | Role |
|---|---|---|
| `--app-bg` | `--ov-bg` | page |
| `--app-rail` | `--ov-rail` | left rail |
| `--app-bg-sunken` | `--ov-rail` | inputs, canvas |
| `--app-surface` | `--ov-panel` | cards, panels |
| `--app-text` | `--ov-text` | body |
| `--app-text-muted` | `--ov-muted` | secondary |
| `--app-border` / `--app-border-strong` | `--ov-line` / `--ov-line-2` | lines |
| `--app-accent` | `--ov-cyan` | links, focus (Observe is the default stage) |
| `--app-font` / `--app-font-mono` | IBM Plex Sans / Mono | type |
| `--app-observe` (new) | `--ov-cyan` | Observe |
| `--app-design` (new) | `--ov-purple` | Design |
| `--app-build` (new) | `--ov-amber` | Build |
| `--app-run` (new) | `--ov-green` | Run |

The Portal's loop page is dark only; the template's light theme
(`[data-app-theme="light"]`) keeps its own values until the Portal has a light
variant to follow.

Fonts: IBM Plex Sans and IBM Plex Mono via `@fontsource` (bundled, no CDN).
Layout: left rail 232 px, loop hero with four cards around the active site.

**Later**: lift the `--ov-*` values into `repos/shared` as one token file that
the Portal and permaculture-cloud both import, so the palette has one home.

## The loop

| Stage | Colour | PDCA | Permaculture meaning | Primary action |
|---|---|---|---|---|
| Observe | cyan | Check | read the site: sentinels, species, weather, robot traces | Open site map |
| Design | purple | Plan | zones, guilds, plants; what-if in the twin | Model the site |
| Build | amber | Do | earthworks, planting, posts, anchors, nest; pair edges | Pair hardware |
| Run | green | Act | accept interventions, missions, alerts; back to Observe | Review interventions |

Texts follow the Portal's tone: short, plain, EN master with DE and FR.
