import type { GatsbyConfig } from "gatsby";

/**
 * Set GATSBY_SITE_URL in the Amplify branch environment so canonical URLs
 * point at the right host per environment.
 *
 * There is no sitemap or robots plugin here, and that is deliberate: every
 * route sits behind Cognito, so there is nothing for a crawler to index.
 */
const siteUrl = process.env.GATSBY_SITE_URL || "https://permtek-5.digitalhome.cloud";

const config: GatsbyConfig = {
  siteMetadata: {
    title: "PermTek-5",
    description:
      "Gatsby 5 frontend and Amplify Gen 2 backend, behind one Cognito gate.",
    siteUrl,
  },
  graphqlTypegen: true,
  // Empty on purpose. Every plugin added here is one a fork has to justify,
  // and the three that usually get added first — sitemap, robots, manifest —
  // describe a site to crawlers that cannot reach any of it.
  plugins: [],
};

export default config;
