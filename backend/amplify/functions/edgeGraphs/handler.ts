// The edge side of A-Box sync, /tenant (which tenant and spaces this edge serves), /plan (the cloud's bed
// planner for the edge's agent, docs/adr/0027) and /care (the guild's care record, docs/adr/0031). An edge reads a graph with its
// version, merges locally statement by statement against the version it
// last synced, and writes back naming the version it read. If someone saved
// meanwhile, it gets 409 and the current document, and merges again.
import { UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { extractBearer, json, parseJsonBody, versionGate } from "../edge-shared/http";
import { ddb, EDGE_REGISTRY_TABLE, marshall, verifyDeviceToken } from "../edge-shared/registry";
import { careState, readReport, stillPending } from "../graph-shared/care";
import { BadGraphRequest, getGraph, listGraphs, saveGraph } from "../graph-shared/store";
import { planForEdge, type PlanRequest } from "../graph-shared/plan";
import { getSpace, getTenant, spacesOfTenant } from "../shared/spaces";

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const tooOld = versionGate(event);
  if (tooOld) return tooOld;
  const verified = await verifyDeviceToken(extractBearer(event));
  if (!verified.ok) {
    return verified.reason === "revoked" ? json(410, { error: "revoked" }) : json(401, { error: "invalid_token" });
  }
  const body = parseJsonBody<{ name?: string; ttl?: string; baseVersion?: number } & PlanRequest>(event) || {};
  // ADR-0005: an edge reaches only its own tenant's graphs (one per space)
  const tenant = verified.row.tenant_id;
  if (!tenant) return json(403, { error: "no_tenant", message: "this edge belongs to no tenant yet; link it again" });
  try {
    if (event.rawPath.endsWith("/tenant")) {
      // the tenant this edge was linked to, and its spaces: what an edge
      // shows and matches its local A-Boxes against (by name: ids differ
      // between sites)
      const t = await getTenant(tenant);
      const spaces = (await spacesOfTenant(tenant)).map(({ id, name, kind }) => ({ id, name, kind }));
      return json(200, { tenant: t ? { id: t.id, name: t.name } : { id: tenant, name: tenant }, spaces });
    }
    if (event.rawPath.endsWith("/graphs/list")) return json(200, { graphs: await listGraphs(tenant) });
    if (event.rawPath.endsWith("/care")) {
      // the guild's care (docs/adr/0031): what is due, kept with this edge; the site's Done presses go back
      const rep = readReport(body as Record<string, unknown>);
      if (typeof rep === "string") return json(400, { error: "invalid_request", message: rep });
      const careSpace = await getSpace(rep.spaceId);
      if (!careSpace || careSpace.tenantId !== tenant) return json(404, { error: "not_found", message: "no such space in this tenant" });
      const state = careState(rep);
      const applied = rep.applied.length ? " DELETE care_done_pending :applied" : "";
      await ddb.send(new UpdateItemCommand({
        TableName: EDGE_REGISTRY_TABLE,
        Key: marshall({ edge_id: verified.row.edge_id }),
        UpdateExpression: `SET care = :care${applied}`,
        ConditionExpression: "#s = :linked",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: marshall({ ":care": state, ":linked": "linked", ...(applied ? { ":applied": new Set(rep.applied) } : {}) }),
      }));
      return json(200, { done: stillPending(verified.row.care_done_pending, rep.applied), due: state.due.length });
    }
    const space = await getSpace(String(body.name || ""));
    if (!space || space.tenantId !== tenant) return json(404, { error: "not_found", message: "no such space in this tenant" });
    if (event.rawPath.endsWith("/graphs/get")) {
      const g = await getGraph(space.id);
      return json(200, g ?? { name: space.id, version: 0, ttl: "" });
    }
    if (event.rawPath.endsWith("/plan")) {
      // the bed planner (docs/adr/0027): a proposal, never saved here
      const g = await getGraph(space.id);
      const r = planForEdge(g?.ttl ?? "", body);
      return json(r.status, r.body);
    }
    if (event.rawPath.endsWith("/graphs/put")) {
      if (typeof body.ttl !== "string") return json(400, { error: "invalid_request", message: "ttl is required" });
      const r = await saveGraph(space.id, body.ttl, Number(body.baseVersion ?? -1),
        `edge:${verified.row.edge_id}`, { spaceId: space.id, tenantId: tenant });
      if (r.status === "conflict") return json(409, { error: "version_conflict", current: r.current });
      if (r.status === "invalid") return json(422, { error: "invalid", problems: r.problems });
      return json(200, r);
    }
    return json(404, { error: "not_found" });
  } catch (err) {
    if (err instanceof BadGraphRequest) return json(400, { error: "invalid_request", message: err.message });
    console.error("edgeGraphs failed", { edge: verified.row.edge_id, err });
    return json(500, { error: "server_error" });
  }
};
