import { getD1 } from "@/db/d1";
import {
  cleanText,
  databaseError,
  distanceMeters,
  finiteNumber,
  getVisitor,
  json,
} from "../../shared";

type ProposalIdentity = {
  id: string;
  contributorKey: string;
  latitude: number;
  longitude: number;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const visitor = getVisitor(request);

  try {
    const { id: rawId } = await context.params;
    const id = cleanText(rawId, 80);
    const payload = (await request.json()) as Record<string, unknown>;
    const verifierName = cleanText(payload.verifierName, 30);
    const currentLatitude = finiteNumber(payload.currentLatitude);
    const currentLongitude = finiteNumber(payload.currentLongitude);
    const gpsAccuracyM = finiteNumber(payload.gpsAccuracyM);

    if (!id || !verifierName) {
      return json({ error: "确认位置前，请填写你的署名。" }, 400, visitor);
    }

    const db = getD1();
    const proposal = await db.prepare(`
      SELECT
        id,
        contributor_key AS contributorKey,
        latitude,
        longitude
      FROM location_proposals
      WHERE id = ? AND status != 'rejected'
    `).bind(id).first<ProposalIdentity>();

    if (!proposal) return json({ error: "没有找到这条位置提案。" }, 404, visitor);
    if (proposal.contributorKey === visitor.key) {
      return json({ error: "提交者不能确认自己的位置提案。" }, 409, visitor);
    }

    const existing = await db.prepare(`
      SELECT id FROM location_confirmations
      WHERE proposal_id = ? AND verifier_key = ?
    `).bind(id, visitor.key).first<{ id: string }>();

    let confirmed: boolean;
    if (existing) {
      await db.prepare(`
        DELETE FROM location_confirmations
        WHERE proposal_id = ? AND verifier_key = ?
      `).bind(id, visitor.key).run();
      confirmed = false;
    } else {
      const hasCurrentPosition = currentLatitude !== null && currentLongitude !== null;
      const distance = hasCurrentPosition
        ? distanceMeters(
            proposal.latitude,
            proposal.longitude,
            currentLatitude,
            currentLongitude,
          )
        : null;
      const onSite = distance !== null && distance <= 80 && (gpsAccuracyM ?? 999) <= 60;
      await db.prepare(`
        INSERT INTO location_confirmations (
          id, proposal_id, verifier_key, verifier_name, on_site,
          gps_accuracy_m, distance_from_proposal_m
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        `confirmation_${crypto.randomUUID()}`,
        id,
        visitor.key,
        verifierName,
        onSite ? 1 : 0,
        gpsAccuracyM !== null ? Math.min(Math.max(gpsAccuracyM, 0), 10_000) : null,
        distance !== null ? Math.min(distance, 1_000_000) : null,
      ).run();
      confirmed = true;
    }

    await db.prepare(`
      UPDATE location_proposals
      SET
        confirmation_count = (
          SELECT COUNT(*) FROM location_confirmations WHERE proposal_id = ?
        ),
        status = CASE
          WHEN status = 'accepted' THEN 'accepted'
          WHEN (SELECT COUNT(*) FROM location_confirmations WHERE proposal_id = ?) >= 3
            THEN 'community_verified'
          ELSE 'pending'
        END
      WHERE id = ?
    `).bind(id, id, id).run();

    const updated = await db.prepare(`
      SELECT confirmation_count AS confirmationCount, status
      FROM location_proposals WHERE id = ?
    `).bind(id).first<{ confirmationCount: number; status: string }>();

    return json({ confirmed, ...updated }, 200, visitor);
  } catch (error) {
    return databaseError(error);
  }
}
