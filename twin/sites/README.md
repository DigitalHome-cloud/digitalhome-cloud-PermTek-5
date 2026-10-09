# Sites

Every folder here is a **virtual** site, invented for study and research, and
public (CC0). Add one by copying a folder and changing its `site.json`; no code
changes. Generate it by name: `python3 tools/generate_world.py --site <name>`.

| Site | Slope | For |
|---|---|---|
| [permademo](permademo/) | ~25 % | the reference: frame, exploration, vegetation, post routine |

Real sites are never added here: they stay in a private repository and are
passed by path (`--site ../private/site.json`). `scripts/check-public.sh`
refuses real elevations, plans and names in this folder.
