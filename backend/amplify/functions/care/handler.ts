// guildCare(spaceId) and markCareDone(edgeId, taskId) (docs/adr/0031).
//
// The edge keeps the care record; /edge/v1/care keeps what is due on the edge's registry row. The site reads it
// here, and a person's Done waits on the row (a string set) until the edge has carried it out. Only a person's
// task can be done from the site: the robot's jobs are confirmed on the edge, never from the cloud.
import { GetItemCommand, ScanCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import type { AppSyncResolverEvent } from "aws-lambda";
import { ddb, EDGE_REGISTRY_TABLE, marshall, unmarshall, type EdgeRow } from "../edge-shared/registry";
import { isPersonTask } from "../graph-shared/care";
import { claimsOf } from "../shared/claims";
import { requireMfa } from "../shared/mfa";
import { canRead, getSpace, isAdminOf } from "../shared/spaces";

interface Args { spaceId?: string; edgeId?: string; taskId?: string }

const view = (row: EdgeRow) => ({
  edgeId: row.edge_id,
  hostname: row.hostname ?? null,
  care: row.care ?? null,
  pending: [...(row.care_done_pending ?? [])].sort(),
});

export const handler = async (event: AppSyncResolverEvent<Args>) => {
  if (!EDGE_REGISTRY_TABLE) throw new Error("Server misconfigured");
  const { groups, username, userPoolId } = claimsOf(event.identity);
  // Gen 2 puts the operation name at the top level (event.fieldName)
  const field = (event as unknown as { fieldName?: string }).fieldName ?? event.info?.fieldName;

  if (field === "guildCare") {
    const space = await getSpace(String(event.arguments.spaceId || ""));
    if (!space || !canRead(groups, space)) throw new Error("Only the space's readers may see its care");
    // A tenant has a handful of edges; a Scan is honest about that (as listEdges).
    const res = await ddb.send(new ScanCommand({ TableName: EDGE_REGISTRY_TABLE }));
    return (res.Items || []).map((i) => unmarshall(i) as EdgeRow & { care?: { spaceId?: string } })
      .filter((r) => r.status === "linked" && r.tenant_id === space.tenantId && r.care?.spaceId === space.id)
      .map(view);
  }

  if (field === "markCareDone") {
    const edgeId = String(event.arguments.edgeId || "");
    const taskId = String(event.arguments.taskId || "");
    if (!isPersonTask(taskId)) throw new Error("Only a person's care task can be done from the site");
    const got = await ddb.send(new GetItemCommand({ TableName: EDGE_REGISTRY_TABLE, Key: marshall({ edge_id: edgeId }) }));
    const row = got.Item ? (unmarshall(got.Item) as EdgeRow & { care?: { spaceId?: string } }) : null;
    const space = row?.care?.spaceId ? await getSpace(row.care.spaceId) : null;
    if (!row || !space || row.tenant_id !== space.tenantId || !isAdminOf(groups, space.tenantId)) {
      throw new Error("Only the tenant's admins may mark its care done");
    }
    await requireMfa(userPoolId, username);
    const res = await ddb.send(new UpdateItemCommand({
      TableName: EDGE_REGISTRY_TABLE,
      Key: marshall({ edge_id: edgeId }),
      UpdateExpression: "ADD care_done_pending :t",
      ConditionExpression: "#s = :linked",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: marshall({ ":t": new Set([taskId]), ":linked": "linked" }),
      ReturnValues: "ALL_NEW",
    }));
    return view(unmarshall(res.Attributes!) as EdgeRow);
  }

  throw new Error(`Unknown operation: ${field}`);
};
