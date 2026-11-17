import type { GatsbyNode } from "gatsby";

/**
 * `node:` builtins are left as runtime requires, for the SSR bundle only.
 *
 * The HTML renderer runs in Node, so bundling them is neither necessary nor
 * possible — webpack fails outright with "Reading from node:sqlite is not
 * handled by plugins". They reach the module graph through a transitive
 * dependency of aws-amplify that guards its use at runtime, which webpack
 * cannot see.
 */
export const onCreateWebpackConfig: GatsbyNode["onCreateWebpackConfig"] = ({
  stage,
  actions,
}) => {
  if (stage !== "build-html" && stage !== "develop-html") return;

  actions.setWebpackConfig({
    externals: [
      (
        { request }: { request?: string },
        callback: (err?: unknown, result?: string) => void
      ) =>
        request?.startsWith("node:")
          ? callback(undefined, `commonjs ${request}`)
          : callback(),
    ],
  });
};

/**
 * Space routes are client-only.
 *
 * A space's content is authenticated per-Cognito-group data living in S3,
 * so there is nothing to statically render and no build-time list of ids to
 * render it from. `matchPath` lets Gatsby serve /w/<id>/... from a single
 * page component that reads the id at runtime.
 *
 * This has a consequence OUTSIDE this repository: no file exists at
 * /w/<id>/, so Amplify Hosting needs an explicit 200 rewrite ahead of its
 * catch-all. See constraint 11 in the dlab5-cloud-template skill. Adding another client-only route
 * here means adding another hosting rule there.
 */
export const onCreatePage: GatsbyNode["onCreatePage"] = async ({
  page,
  actions,
}) => {
  if (page.path === "/w/") {
    actions.deletePage(page);
    actions.createPage({ ...page, matchPath: "/w/*" });
  }
};

/**
 * `/edge.json`: where an edge finds this site's edge API, so a person links
 * an edge by the site's address instead of pasting an AWS URL. It repeats
 * what the About page shows (custom.app in the backend's outputs): nothing
 * here is a credential. Without outputs (a build with no backend) it is not
 * written, and an edge then asks for the address by hand.
 */
export const onPostBuild: GatsbyNode["onPostBuild"] = async ({ reporter }) => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  let app: Record<string, string> | undefined;
  try {
    app = JSON.parse(fs.readFileSync(path.join(__dirname, "src", "amplify_outputs.json"), "utf8")).custom?.app;
  } catch {
    app = undefined;
  }
  if (!app?.edgeApi) {
    reporter.info("no backend outputs: /edge.json not written");
    return;
  }
  fs.writeFileSync(
    path.join(__dirname, "public", "edge.json"),
    JSON.stringify({ name: "PermTek-5", edgeApi: app.edgeApi, minEdgeVersion: app.minEdgeVersion ?? null,
                     environment: app.environment ?? null, link: "/link" }) + "\n",
  );
};
