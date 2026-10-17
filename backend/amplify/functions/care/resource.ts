import { defineFunction } from "@aws-amplify/backend";

// A guild's care for the site (docs/adr/0031): guildCare reads what its edge last reported (a space's readers),
// markCareDone leaves a person's Done for the edge to carry out (the tenant's admins). IAM + env in backend.ts.
export const care = defineFunction({
  name: "care",
  entry: "./handler.ts",
  timeoutSeconds: 15,
  resourceGroupName: "data",
});
