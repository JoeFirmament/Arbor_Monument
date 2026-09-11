import { getD1 } from "@/db/d1";
import type { LocationProposal, VerifiedLocation } from "@/app/location-types";
import {
  cleanText,
  databaseError,
  finiteNumber,
  getVisitor,
  isSuzhouArea,
  json,
} from "./shared";

type ProposalRow = Omit<
  LocationProposal,
  "coordinateSystem" | "captureMethod" | "status" | "confirmationNames" | "viewerConfirmed" | "viewerOwns"
> & {
  coordinateSystem: string;
  captureMethod: string;
  status: string;
  confirmationNames: string | null;
  viewerConfirmed: number;
  viewerOwns: number;
};

function proposalFromRow(row: ProposalRow): LocationProposal {
  return {
    ...row,
    coordinateSystem: "WGS84",
    captureMethod: row.captureMethod as LocationProposal["captureMethod"],
    status: row.status as LocationProposal["status"],
    confirmationNames: row.confirmationNames
      ? row.confirmationNames.split("｜").filter(Boolean)
      : [],
    viewerConfirmed: Boolean(row.viewerConfirmed),
    viewerOwns: Boolean(row.viewerOwns),
  };
}

export async function GET(request: Request) {
  const visitor = getVisitor(request);
  const treeId = cleanText(new URL(request.url).searchParams.get("treeId"), 100);

  try {
    const db = getD1();
    if (!treeId) {
      const result = await db.prepare(`
        WITH ranked AS (
          SELECT
            id,
            tree_id AS treeId,
            latitude,
            longitude,
            status,
            confirmation_count AS confirmationCount,
            contributor_name AS contributorName,
            ROW_NUMBER() OVER (
              PARTITION BY tree_id
              ORDER BY
                CASE status WHEN 'accepted' THEN 2 ELSE 1 END DESC,
                confirmation_count DESC,
                created_at DESC
            ) AS rank
          FROM location_proposals
          WHERE status = 'accepted' OR confirmation_count >= 3
        )
        SELECT id, treeId, latitude, longitude, status, confirmationCount, contributorName
        FROM ranked
        WHERE rank = 1
      `).all<VerifiedLocation>();
      return json({ locations: result.results }, 200, visitor);
    }

    const result = await db.prepare(`
      SELECT
        p.id,
        p.tree_id AS treeId,
        p.contributor_name AS contributorName,
        p.latitude,
        p.longitude,
        p.coordinate_system AS coordinateSystem,
        p.accuracy_m AS accuracyM,
        p.capture_method AS captureMethod,
        p.location_description AS locationDescription,
        p.status,
        p.confirmation_count AS confirmationCount,
        p.created_at AS createdAt,
        (
          SELECT GROUP_CONCAT(c.verifier_name, '｜')
          FROM location_confirmations c
          WHERE c.proposal_id = p.id
        ) AS confirmationNames,
        EXISTS(
          SELECT 1 FROM location_confirmations c
          WHERE c.proposal_id = p.id AND c.verifier_key = ?
        ) AS viewerConfirmed,
        CASE WHEN p.contributor_key = ? THEN 1 ELSE 0 END AS viewerOwns
      FROM location_proposals p
      WHERE p.tree_id = ? AND p.status != 'rejected'
      ORDER BY
        CASE p.status WHEN 'accepted' THEN 2 WHEN 'community_verified' THEN 1 ELSE 0 END DESC,
        p.confirmation_count DESC,
        p.created_at DESC
      LIMIT 20
    `).bind(visitor.key, visitor.key, treeId).all<ProposalRow>();

    return json(
      { proposals: result.results.map(proposalFromRow) },
      200,
      visitor,
    );
  } catch (error) {
    return databaseError(error);
  }
}

export async function POST(request: Request) {
  const visitor = getVisitor(request);

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const treeId = cleanText(payload.treeId, 100);
    const contributorName = cleanText(payload.contributorName, 30);
    const locationDescription = cleanText(payload.locationDescription, 160);
    const latitude = finiteNumber(payload.latitude);
    const longitude = finiteNumber(payload.longitude);
    const accuracyM = finiteNumber(payload.accuracyM);
    const captureMethod = cleanText(payload.captureMethod, 32);
    const allowedMethods = new Set(["device_gps", "manual_coordinates", "map_pin"]);

    if (!treeId || !contributorName) {
      return json({ error: "请填写探寻者署名。" }, 400, visitor);
    }
    if (latitude === null || longitude === null || !isSuzhouArea(latitude, longitude)) {
      return json({ error: "坐标不在苏州及周边的合理范围内。" }, 400, visitor);
    }
    if (!allowedMethods.has(captureMethod)) {
      return json({ error: "无法识别坐标的采集方式。" }, 400, visitor);
    }

    const db = getD1();
    const recent = await db.prepare(`
      SELECT COUNT(*) AS count
      FROM location_proposals
      WHERE contributor_key = ? AND created_at >= datetime('now', '-10 minutes')
    `).bind(visitor.key).first<{ count: number }>();
    if ((recent?.count ?? 0) >= 5) {
      return json({ error: "提交得太频繁，请稍后再试。" }, 429, visitor);
    }

    const id = `loc_${crypto.randomUUID()}`;
    await db.prepare(`
      INSERT INTO location_proposals (
        id, tree_id, contributor_key, contributor_name, latitude, longitude,
        coordinate_system, accuracy_m, capture_method, location_description
      ) VALUES (?, ?, ?, ?, ?, ?, 'WGS84', ?, ?, ?)
    `).bind(
      id,
      treeId,
      visitor.key,
      contributorName,
      latitude,
      longitude,
      accuracyM !== null && accuracyM >= 0 ? Math.min(accuracyM, 10_000) : null,
      captureMethod,
      locationDescription,
    ).run();

    return json({ id, status: "pending" }, 201, visitor);
  } catch (error) {
    return databaseError(error);
  }
}
