import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Location corrections are proposals rather than edits to the official record.
 * Keeping the official catalogue immutable makes every community change
 * attributable and reversible.
 */
export const locationProposals = sqliteTable(
  "location_proposals",
  {
    id: text("id").primaryKey(),
    treeId: text("tree_id").notNull(),
    contributorKey: text("contributor_key").notNull(),
    contributorName: text("contributor_name").notNull(),
    latitude: real("latitude").notNull(),
    longitude: real("longitude").notNull(),
    coordinateSystem: text("coordinate_system").notNull().default("WGS84"),
    accuracyM: real("accuracy_m"),
    captureMethod: text("capture_method").notNull(),
    locationDescription: text("location_description").notNull().default(""),
    status: text("status").notNull().default("pending"),
    confirmationCount: integer("confirmation_count").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    reviewedAt: text("reviewed_at"),
    reviewedBy: text("reviewed_by"),
  },
  (table) => [
    index("idx_location_proposals_tree_status").on(table.treeId, table.status),
    index("idx_location_proposals_contributor_created").on(
      table.contributorKey,
      table.createdAt,
    ),
  ],
);

export const locationConfirmations = sqliteTable(
  "location_confirmations",
  {
    id: text("id").primaryKey(),
    proposalId: text("proposal_id")
      .notNull()
      .references(() => locationProposals.id, { onDelete: "cascade" }),
    verifierKey: text("verifier_key").notNull(),
    verifierName: text("verifier_name").notNull(),
    onSite: integer("on_site", { mode: "boolean" }).notNull().default(false),
    gpsAccuracyM: real("gps_accuracy_m"),
    distanceFromProposalM: real("distance_from_proposal_m"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_location_confirmations_proposal_verifier").on(
      table.proposalId,
      table.verifierKey,
    ),
    index("idx_location_confirmations_proposal").on(table.proposalId),
  ],
);
