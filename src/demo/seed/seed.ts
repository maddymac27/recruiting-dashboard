import { drizzle } from "drizzle-orm/node-sqlite";
import type { NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import { pathToFileURL } from "node:url";
import { roleTypes, sources, stages } from "@/db/schema";
import { seedLookups } from "@/db/seed-lookups";
import { resolveDbPath } from "@/db/paths";
import { runMigrations } from "@/db/migrate";
import { openSqliteFile } from "@/db/open-sqlite";
import { createCompany } from "@/domain/companies";
import { createApplication } from "@/domain/applications";
import { appendStatusEvent } from "@/domain/events";
import { createContact, linkContactToApplication, addConversation } from "@/domain/contacts";
import { createOutreach } from "@/domain/outreach";
import { DEMO_COMPANIES } from "./companies";

// ---------------------------------------------------------------------------
// This module MUST NEVER address the other (non-demo) store. It resolves
// ONLY `resolveDbPath("demo")` (see runCli below) and its fixture data
// (./companies.ts) is a versioned, literal, invented-only .ts file — there
// is no code path here that opens the other store's file or accepts
// external/production input (DEMO-02, D-13, RESEARCH Pitfall 4).
// ---------------------------------------------------------------------------

function buildLookupMap(
  db: NodeSQLiteDatabase,
  table: typeof stages | typeof sources | typeof roleTypes,
): Record<string, number> {
  const rows = db.select({ id: table.id, label: table.label }).from(table).all();
  return Object.fromEntries(rows.map((r) => [r.label, r.id]));
}

/**
 * Populates the given (already-migrated) DB with the invented demo dataset
 * (DEMO-01, D-12): seeds the canonical lookups, then replays each fixture in
 * ./companies.ts through the same domain write path real ingestion uses
 * (createCompany, createApplication, appendStatusEvent, createContact,
 * linkContactToApplication, addConversation) so every resulting
 * application's current-stage projection is correctly derived, never
 * hand-set.
 */
export function seedDemo(db: NodeSQLiteDatabase): void {
  seedLookups(db);

  const stageIdByLabel = buildLookupMap(db, stages);
  const sourceIdByLabel = buildLookupMap(db, sources);
  const roleTypeIdByLabel = buildLookupMap(db, roleTypes);

  for (const fixture of DEMO_COMPANIES) {
    const companyId = createCompany(db, fixture.companyName);

    const applicationId = createApplication(db, {
      companyId,
      roleTitle: fixture.roleTitle,
      roleTypeId: roleTypeIdByLabel[fixture.roleType],
      sourceId: sourceIdByLabel[fixture.source],
      dateApplied: fixture.dateApplied ?? undefined,
    });

    for (const event of fixture.events) {
      appendStatusEvent(db, {
        applicationId,
        stageId: stageIdByLabel[event.stage],
        occurredAt: event.occurredAt,
      });
    }

    for (const contactFixture of fixture.contacts ?? []) {
      const contactId = createContact(db, {
        companyId,
        name: contactFixture.name,
        roleTitle: contactFixture.roleTitle,
        channel: contactFixture.channel,
        email: contactFixture.email,
        relationshipType: contactFixture.relationshipType,
        source: contactFixture.source,
      });

      linkContactToApplication(db, contactId, applicationId);

      for (const conversation of contactFixture.conversations ?? []) {
        addConversation(db, {
          contactId,
          applicationId,
          occurredAt: conversation.occurredAt,
          channel: conversation.channel,
          notes: conversation.notes,
        });
      }

      for (const outreachFixture of contactFixture.outreach ?? []) {
        createOutreach(db, {
          contactId,
          companyId,
          channel: outreachFixture.channel,
          purpose: outreachFixture.purpose,
          subject: outreachFixture.subject,
          body: outreachFixture.body,
          sentDate: outreachFixture.sentDate,
          responded: outreachFixture.responded,
          outcome: outreachFixture.outcome,
          source: "manual",
          sourceMessageId: null,
        });
      }
    }
  }
}

function runCli() {
  // Resolves ONLY the demo path — this script has no reference to and no
  // code path capable of resolving/opening the other store (DEMO-02, D-13).
  const dbPath = resolveDbPath("demo");

  const sqlite = openSqliteFile(dbPath);
  const db = drizzle({ client: sqlite });
  runMigrations(db);
  seedDemo(db);
  console.log(`Demo dataset seeded into ${dbPath}`);
}

const isDirectCliInvocation =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectCliInvocation) {
  runCli();
}
