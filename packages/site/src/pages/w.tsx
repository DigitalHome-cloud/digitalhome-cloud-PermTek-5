import * as React from "react";
import type { HeadFC, PageProps } from "gatsby";
import { Shell } from "../components/Shell";
import { useSession } from "../components/AuthGate";
import { HabitatMap } from "../components/habitat/HabitatMap";
import { HabitatRecipes } from "../components/habitat/HabitatRecipes";
import { HabitatCalendar, HabitatNow } from "../components/habitat/HabitatCalendar";
import { HabitatTransfer } from "../components/habitat/HabitatTransfer";
import { SaveBar } from "../components/habitat/common";
import { getSpace, spaceTitle } from "../lib/data";
import type { Space } from "../lib/data";
import { useAreaMonths, useHabitat } from "../lib/useHabitat";
import { useT } from "../lib/i18n";

/**
 * Every route under /w/.
 *
 * This is a client-only page (see `onCreatePage` in gatsby-node.ts): there is
 * no build-time list of space ids, and a space's content is
 * authenticated per-group data in S3, so there is nothing to statically
 * render. The id and the view come out of the URL at runtime.
 *
 * ONE page component for all the views rather than five matchPath routes.
 * The alternative needs a hosting rewrite per route (constraint 11 in the dlab5-cloud-template skill)
 * — configuration that lives outside this repository and that nobody will
 * remember to add.
 *
 * When a view outgrows a `case`, move it to its own component in
 * src/components/ and keep the switch as the router. Do not turn the switch
 * into a lookup table: the whole value of it is that the reader sees every
 * route a space has in one screenful.
 */

const VIEWS = [
  "overview",
  "calendar",
  "now",
  "recipes",
  "import",
  "export",
] as const;

type View = (typeof VIEWS)[number];

/**
 * `/w/s-4k9mqhtx2p/calendar/` → `{ id, view }`.
 *
 * A missing or unrecognised trailing segment resolves to "overview" rather
 * than 404: /w/<id>/ is the space's home, and a typo in a view name is
 * better answered with the space than with a dead end.
 */
function parse(pathname: string): { id?: string; view: View } {
  const parts = pathname.split("/").filter(Boolean); // ["w", id, view?]
  const id = parts[1];
  const candidate = parts[2] as View | undefined;
  return {
    id,
    view: candidate && VIEWS.includes(candidate) ? candidate : "overview",
  };
}

const SpacePage: React.FC<PageProps> = ({ location }) => {
  const { id, view } = parse(location.pathname);
  const { t } = useT();

  const [space, setSpace] = React.useState<Space | null>(null);
  const [state, setState] = React.useState<"loading" | "ready" | "denied">(
    "loading"
  );
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!id) {
      setState("denied");
      return;
    }
    getSpace(id)
      .then((found) => {
        setSpace(found);
        // null covers both "no such space" and "not yours". AppSync does
        // not distinguish them and neither does this screen — telling them
        // apart would let anyone enumerate ids.
        setState(found ? "ready" : "denied");
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        setState("denied");
      });
  }, [id]);

  if (state === "loading") {
    return (
      <Shell space={id ? { id, active: view } : undefined}>
        <p className="pt-muted">Loading…</p>
      </Shell>
    );
  }

  if (state === "denied" || !space || !id) {
    return (
      <Shell>
        <h1>Not available</h1>
        <div className="pt-empty">
          <p>No such space, or you do not have access to it.</p>
          <p className="pt-muted">
            Access is granted by an admin of the space&rsquo;s tenant, in
            Settings: they add your account to the space&rsquo;s readers.
          </p>
          {error && (
            <p className="pt-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </Shell>
    );
  }

  return (
    <Shell space={{ id, name: spaceTitle(space), active: view }}>
      <div className="pt-pagehead">
        <h1>{t(`view.${view}`)}</h1>
        <span className="pt-muted">{spaceTitle(space)}</span>
      </div>
      <ViewBody view={view} space={space} />
    </Shell>
  );
};

/**
 * The habitat's views (docs/adr/0016). The map lives in the space's A-Box;
 * the calendar and "now" are derived from it and the area's climate. Tenant
 * admins edit; readers see the same screens read-only.
 */
function ViewBody({ view, space }: { view: View; space: Space }) {
  const { t } = useT();
  const session = useSession();
  const canEdit = session.tenants.includes(space.tenantId);
  const hab = useHabitat(space.id);
  const area = useAreaMonths(space.tenantId);

  if (hab.error) return <p className="pt-error" role="alert">{hab.error}</p>;
  if (!hab.habitat) return <p className="pt-muted">{t("lib.loading")}</p>;
  const h = hab.habitat;

  return (
    <>
      {canEdit && <SaveBar dirty={hab.dirty} saving={hab.saving} onSave={() => hab.save()} onDiscard={hab.discard} />}
      {!canEdit && <p className="pt-muted">{t("hab.readonly")}</p>}
      {view === "overview" && <HabitatMap habitat={h} edit={hab.edit} canEdit={canEdit} replace={hab.replace} />}
      {view === "calendar" && <HabitatCalendar habitat={h} months={area.months} areaName={area.areaName} />}
      {view === "now" && <HabitatNow habitat={h} months={area.months} areaName={area.areaName} />}
      {view === "recipes" && <HabitatRecipes habitat={h} edit={hab.edit} canEdit={canEdit} months={area.months} areaName={area.areaName} />}
      {(view === "import" || view === "export") && <HabitatTransfer habitat={h} canEdit={canEdit} replace={hab.replace} mode={view} />}
    </>
  );
}

export default SpacePage;

export const Head: HeadFC = () => <title>Habitat · PermTek-5</title>;
