import * as React from "react";
import type { HeadFC, PageProps } from "gatsby";
import { Link } from "gatsby";
import { Shell } from "../components/Shell";
import { useSession } from "../components/AuthGate";
import { HabitatPanel, HomeEntry } from "../components/Habitat";
import { listSpaces, listTenants } from "../lib/data";
import type { Space, Tenant } from "../lib/data";
import { useT } from "../lib/i18n";

/**
 * The launcher: the spaces this person can open, grouped by tenant.
 *
 * Reached only after AuthGate has a session, so there is no signed-out branch
 * to handle here — and no page below needs one either. That is the whole point
 * of gating at the root.
 *
 * Opened from the Portal with `?home=<smartHomeId>`, it starts with that
 * home's habitat (docs/adr/0015); otherwise with the habitats this person
 * administers.
 *
 * Spaces are not created here: a tenant's admins add them in Settings (the
 * tenants function creates the row and its Cognito group together), and
 * operators create tenants there too.
 */
const IndexPage: React.FC<PageProps> = ({ location }) => {
  const session = useSession();
  const { t } = useT();
  const [spaces, setSpaces] = React.useState<Space[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [myTenants, setMyTenants] = React.useState<Tenant[] | null>(null);
  const homeId = new URLSearchParams(location.search).get("home");

  React.useEffect(() => {
    listSpaces()
      .then(setSpaces)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
    // Operators list every tenant; a habitat is shown only to its own admins.
    listTenants()
      .then((ts) => setMyTenants(ts.filter((x) => session.tenants.includes(x.id))))
      .catch(() => setMyTenants([]));
  }, []);

  const habitats = (myTenants ?? []).filter((x) => x.smartHomeId);

  const tenants = [...new Set((spaces ?? []).map((s) => s.tenantName ?? s.tenantId))];

  return (
    <Shell title={t("nav.spaces")}>
      <div className="pt-hero">
        <div className="pt-hero__copy">
          {/* No standing copy here. The cards below say what this page is for,
              and a paragraph explaining the product to someone who has already
              signed in is a paragraph nobody reads twice. */}
          <dl className="pt-stats">
            <div className="pt-stat">
              <dt>{spaces?.length ?? "—"}</dt>
              <dd>{t("home.spaces")}</dd>
            </div>
            <div className="pt-stat">
              <dt>{session.tenants.length}</dt>
              <dd>{t("home.admin")}</dd>
            </div>
            <div className="pt-stat">
              <dt>{session.isOperator ? t("set.role.operator") : session.isAdmin ? t("set.role.admin") : session.isMember ? t("set.role.member") : t("set.role.none")}</dt>
              <dd>{t("home.role")}</dd>
            </div>
          </dl>
        </div>
      </div>

      {homeId
        ? <HomeEntry homeId={homeId} tenants={myTenants} />
        : habitats.map((h) => <HabitatPanel key={h.id} tenant={h} />)}

      <h1 className="pt-cards__heading">{t("nav.spaces")}</h1>

      {error && <p className="pt-error" role="alert">{error}</p>}
      {!spaces && !error && <p className="pt-muted">{t("lib.loading")}</p>}

      {spaces?.length === 0 && (
        <div className="pt-empty">
          <p>{t("home.none")}</p>
          <p className="pt-muted">
            {session.isOperator ? <>{t("home.none.operator")} <Link to="/settings/">{t("nav.settings")}</Link></> : t("home.none.member")}
          </p>
        </div>
      )}

      {spaces && spaces.length > 0 && (
        <ul className="pt-cards">
          {spaces.map((space) => (
            <li key={space.id}>
              <a className="pt-card" href={`/w/${space.id}/`}>
                <span className="pt-card__title">{space.kind === "private" ? "🔒 " : ""}{space.name}</span>
                {/* The id, deliberately not shown. ADR-0003: never render an id
                    where a name belongs. */}
                {tenants.length > 1 && space.tenantName && <span className="pt-card__meta">{space.tenantName}</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
};

export default IndexPage;

export const Head: HeadFC = () => <title>Spaces · permtek5.dlab5</title>;
