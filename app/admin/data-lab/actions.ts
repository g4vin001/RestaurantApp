"use server";

import { createHash, randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ensureProfile } from "@/lib/auth/profile";
import { isAdminEmail, isAdminUnlocked } from "@/lib/admin/auth";
import {
  parseDataLabUpload,
  parseRestaurantTimestamp,
  validateDataLabRows,
  type NormalizedDataLabRows,
} from "@/lib/admin/data-lab";
import { setFlash } from "@/lib/flash";
import { prisma } from "@/lib/prisma";
import { reportDataError } from "@/lib/server/data-error";
import { createClient } from "@/lib/supabase/server";
import { hashRequestAddress } from "@/lib/staff/invitations";

async function requireDataLabAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) redirect("/");
  if (!(await isAdminUnlocked(user.id))) redirect("/admin");
  await ensureProfile(user);
  const requestHeaders = await headers();
  const address = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? requestHeaders.get("x-real-ip") ?? "unknown";
  return { user, ipHash: hashRequestAddress(address) };
}

function batchRows(value: unknown): NormalizedDataLabRows {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Import batch rows are invalid.");
  }
  const rows = value as { tables?: unknown; history?: unknown };
  if (!Array.isArray(rows.tables) || !Array.isArray(rows.history)) {
    throw new Error("Import batch rows are invalid.");
  }
  return rows as NormalizedDataLabRows;
}

export async function stageDataLabImport(formData: FormData) {
  const { user, ipHash } = await requireDataLabAdmin();
  const restaurantId = String(formData.get("restaurantId") ?? "");
  const csvKind = formData.get("csvKind") === "history" ? "history" : "tables";
  const upload = formData.get("file");
  if (!(upload instanceof File) || upload.size === 0) {
    await setFlash("error", "Choose a CSV or XLSX file.");
    redirect("/admin/data-lab");
  }

  try {
    const recentStages = await prisma.adminAuditLog.count({
      where: { actorProfileId: user.id, action: "DATA_LAB_STAGE", createdAt: { gte: new Date(Date.now() - 15 * 60_000) } },
    });
    if (recentStages >= 10) throw new Error("Data Lab upload limit reached. Wait 15 minutes before staging another file.");
    const restaurant = await prisma.restaurant.findFirst({
      where: { id: restaurantId, environment: "TEST", archivedAt: null },
      select: { id: true, diningTables: { where: { archivedAt: null }, select: { label: true, capacity: true } } },
    });
    if (!restaurant) throw new Error("Select an active TEST restaurant.");
    const bytes = new Uint8Array(await upload.arrayBuffer());
    const rows = await parseDataLabUpload({ filename: upload.name, bytes, csvKind });
    const existingSessions = await prisma.diningSession.findMany({
      where: { restaurantId },
      select: {
        id: true,
        seatedAt: true,
        availableAt: true,
        completedAt: true,
        diningTable: { select: { label: true } },
      },
      take: 5_000,
    });
    const validation = validateDataLabRows(
      rows,
      restaurant.diningTables,
      existingSessions.map((session) => ({
        tableLabel: session.diningTable.label,
        seatedAt: session.seatedAt,
        availableAt:
          session.availableAt ?? session.completedAt ?? "9999-12-31T23:59:59.999Z",
        recordId: `database session ${session.id}`,
      })),
    );
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const existing = await prisma.syntheticImportBatch.findUnique({
      where: { restaurantId_checksum: { restaurantId, checksum } },
      select: { id: true, status: true },
    });
    if (existing) {
      await setFlash("message", `This exact file is already ${existing.status.toLowerCase()} as batch ${existing.id}.`);
      return;
    }
    const actorMembership = await prisma.restaurantMembership.findFirst({
      where: { restaurantId, profileId: user.id, active: true },
      select: { id: true },
    });
    await prisma.$transaction(async (tx) => {
      const batch = await tx.syntheticImportBatch.create({
        data: {
          restaurantId,
          actorProfileId: user.id,
          actorMembershipId: actorMembership?.id,
          originalFilename: upload.name,
          sourceType: upload.name.toLowerCase().endsWith(".xlsx") ? "XLSX" : `CSV_${csvKind.toUpperCase()}`,
          checksum,
          normalizedRows: JSON.parse(JSON.stringify(rows)),
          validationResults: validation,
          rowCount: rows.tables.length + rows.history.length,
        },
      });
      await tx.adminAuditLog.create({
        data: {
          restaurantId,
          actorProfileId: user.id,
          actorMembershipId: actorMembership?.id,
          action: "DATA_LAB_STAGE",
          targetType: "SyntheticImportBatch",
          targetId: batch.id,
          details: { filename: upload.name, checksum, rowCount: batch.rowCount, errors: validation.errors.length },
          ipHash,
        },
      });
    }, { isolationLevel: "Serializable" });
    await setFlash(validation.errors.length ? "error" : "message", validation.errors.length ? `Import staged with ${validation.errors.length} validation error(s). It cannot be applied yet.` : "Import staged. Review the preview, then confirm it.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not stage that import.";
    const reference = reportDataError("data-lab-stage", error);
    await setFlash("error", `${message} Support reference: ${reference}`);
  }
  redirect("/admin/data-lab");
}

export async function stageManualDataLabHistory(formData: FormData) {
  const { user, ipHash } = await requireDataLabAdmin();
  const restaurantId = String(formData.get("restaurantId") ?? "");
  const value = (name: string) => String(formData.get(name) ?? "").trim();
  try {
    const recentStages = await prisma.adminAuditLog.count({
      where: {
        actorProfileId: user.id,
        action: "DATA_LAB_STAGE",
        createdAt: { gte: new Date(Date.now() - 15 * 60_000) },
      },
    });
    if (recentStages >= 10) {
      throw new Error(
        "Data Lab staging limit reached. Wait 15 minutes before adding another batch.",
      );
    }
    const restaurant = await prisma.restaurant.findFirst({
      where: { id: restaurantId, environment: "TEST", archivedAt: null },
      select: {
        id: true,
        diningTables: {
          where: { archivedAt: null },
          select: { label: true, capacity: true },
        },
      },
    });
    if (!restaurant) throw new Error("Select an active TEST restaurant.");
    const rows: NormalizedDataLabRows = {
      tables: [],
      history: [
        {
          recordId: value("recordId"),
          tableLabel: value("tableLabel"),
          partyName: value("partyName"),
          partySize: Number(value("partySize")),
          source: value("source").toUpperCase() as "DIRECT" | "WALK_IN" | "RESERVATION",
          joinedAt: parseRestaurantTimestamp(value("joinedAt")),
          promisedWaitMinutes: value("promisedWaitMinutes")
            ? Number(value("promisedWaitMinutes"))
            : undefined,
          scheduledAt: parseRestaurantTimestamp(value("scheduledAt")),
          seatedAt: parseRestaurantTimestamp(value("seatedAt")),
          clearedAt: parseRestaurantTimestamp(value("clearedAt")),
          availableAt: parseRestaurantTimestamp(value("availableAt")),
          outcome: value("outcome").toUpperCase() as "SEATED" | "CANCELLED" | "NO_SHOW",
        },
      ],
    };
    const existingSessions = await prisma.diningSession.findMany({
      where: { restaurantId },
      select: {
        id: true,
        seatedAt: true,
        availableAt: true,
        completedAt: true,
        diningTable: { select: { label: true } },
      },
      take: 5_000,
    });
    const validation = validateDataLabRows(
      rows,
      restaurant.diningTables,
      existingSessions.map((session) => ({
        tableLabel: session.diningTable.label,
        seatedAt: session.seatedAt,
        availableAt:
          session.availableAt ?? session.completedAt ?? "9999-12-31T23:59:59.999Z",
        recordId: `database session ${session.id}`,
      })),
    );
    const serialized = JSON.stringify(rows);
    const checksum = createHash("sha256").update(serialized).digest("hex");
    const existing = await prisma.syntheticImportBatch.findUnique({
      where: { restaurantId_checksum: { restaurantId, checksum } },
      select: { id: true, status: true },
    });
    if (existing) {
      await setFlash(
        "message",
        `That exact manual row is already ${existing.status.toLowerCase()} as batch ${existing.id}.`,
      );
      return;
    }
    const actorMembership = await prisma.restaurantMembership.findFirst({
      where: { restaurantId, profileId: user.id, active: true },
      select: { id: true },
    });
    await prisma.$transaction(
      async (tx) => {
        const batch = await tx.syntheticImportBatch.create({
          data: {
            restaurantId,
            actorProfileId: user.id,
            actorMembershipId: actorMembership?.id,
            originalFilename: `manual-${rows.history[0].recordId || "invalid-row"}`,
            sourceType: "MANUAL_HISTORY",
            checksum,
            normalizedRows: JSON.parse(serialized),
            validationResults: validation,
            rowCount: 1,
          },
        });
        await tx.adminAuditLog.create({
          data: {
            restaurantId,
            actorProfileId: user.id,
            actorMembershipId: actorMembership?.id,
            action: "DATA_LAB_STAGE",
            targetType: "SyntheticImportBatch",
            targetId: batch.id,
            details: {
              source: "MANUAL_HISTORY",
              checksum,
              errors: validation.errors.length,
            },
            ipHash,
          },
        });
      },
      { isolationLevel: "Serializable" },
    );
    await setFlash(
      validation.errors.length ? "error" : "message",
      validation.errors.length
        ? `Manual row staged with ${validation.errors.length} validation error(s).`
        : "Manual history staged. Review it, then confirm the atomic apply.",
    );
  } catch (error) {
    const reference = reportDataError("data-lab-manual-stage", error);
    await setFlash(
      "error",
      `${error instanceof Error ? error.message : "Could not stage that manual row."} Support reference: ${reference}`,
    );
  }
  redirect(`/admin/data-lab?restaurantId=${restaurantId}`);
}

export async function applyDataLabImport(formData: FormData) {
  const { user, ipHash } = await requireDataLabAdmin();
  const batchId = String(formData.get("batchId") ?? "");
  try {
    await prisma.$transaction(async (tx) => {
      const batch = await tx.syntheticImportBatch.findFirst({
        where: { id: batchId, restaurant: { environment: "TEST", archivedAt: null } },
        include: { restaurant: true },
      });
      if (!batch) throw new Error("Import batch was not found on an active TEST restaurant.");
      if (batch.status === "APPLIED") return;
      if (batch.status !== "STAGED") throw new Error("Only a staged import can be applied.");
      const validation = batch.validationResults as { errors?: unknown };
      if (Array.isArray(validation.errors) && validation.errors.length) throw new Error("Fix the staged validation errors before applying this batch.");
      const rows = batchRows(batch.normalizedRows);
      const currentTables = await tx.diningTable.findMany({
        where: { restaurantId: batch.restaurantId, archivedAt: null },
        select: { label: true, capacity: true },
      });
      const currentSessions = await tx.diningSession.findMany({
        where: { restaurantId: batch.restaurantId },
        select: {
          id: true,
          seatedAt: true,
          availableAt: true,
          completedAt: true,
          diningTable: { select: { label: true } },
        },
        take: 5_000,
      });
      const currentValidation = validateDataLabRows(
        rows,
        currentTables,
        currentSessions.map((session) => ({
          tableLabel: session.diningTable.label,
          seatedAt: session.seatedAt,
          availableAt:
            session.availableAt ?? session.completedAt ?? "9999-12-31T23:59:59.999Z",
          recordId: `database session ${session.id}`,
        })),
      );
      if (currentValidation.errors.length) {
        throw new Error(
          `The TEST restaurant changed after staging: ${currentValidation.errors[0]}`,
        );
      }
      for (const table of rows.tables) {
        await tx.diningTable.create({
          data: {
            restaurantId: batch.restaurantId,
            label: table.tableLabel,
            zone: table.zone,
            capacity: table.capacity,
            minPartySize: table.minPartySize,
            maxPartySize: table.maxPartySize,
            shape: table.shape,
            syntheticBatchId: batch.id,
          },
        });
      }
      const tables = await tx.diningTable.findMany({
        where: { restaurantId: batch.restaurantId, archivedAt: null },
        select: { id: true, label: true },
      });
      const tableByLabel = new Map(tables.map((table) => [table.label.toLowerCase(), table]));
      let queuePosition = (await tx.queueEntry.aggregate({
        where: { restaurantId: batch.restaurantId },
        _max: { position: true },
      }))._max.position ?? -1;
      for (const record of rows.history) {
        const table = tableByLabel.get(record.tableLabel.toLowerCase());
        if (!table) throw new Error(`Table ${record.tableLabel} disappeared before apply.`);
        let queueEntryId: string | undefined;
        let reservationId: string | undefined;
        if (record.source === "WALK_IN") {
          queuePosition += 1;
          const queue = await tx.queueEntry.create({
            data: {
              restaurantId: batch.restaurantId,
              partyName: record.partyName,
              partySize: record.partySize,
              promisedWaitMinutes: record.promisedWaitMinutes ?? 0,
              joinedAt: new Date(record.joinedAt as string),
              status: record.outcome === "SEATED" ? "SEATED" : record.outcome,
              seatedAt: record.seatedAt ? new Date(record.seatedAt) : null,
              cancelledAt: record.outcome === "CANCELLED" ? new Date(record.joinedAt as string) : null,
              noShowAt: record.outcome === "NO_SHOW" ? new Date(record.joinedAt as string) : null,
              assignedTableId: table.id,
              source: "SYNTHETIC",
              position: queuePosition,
              syntheticBatchId: batch.id,
            },
          });
          queueEntryId = queue.id;
        } else if (record.source === "RESERVATION") {
          const reservation = await tx.reservation.create({
            data: {
              restaurantId: batch.restaurantId,
              partyName: record.partyName,
              partySize: record.partySize,
              scheduledAt: new Date(record.scheduledAt as string),
              status: record.outcome === "SEATED" ? "COMPLETED" : record.outcome,
              assignedTableId: table.id,
              seatedAt: record.seatedAt ? new Date(record.seatedAt) : null,
              completedAt: record.availableAt ? new Date(record.availableAt) : null,
              cancelledAt: record.outcome === "CANCELLED" ? new Date(record.scheduledAt as string) : null,
              noShowAt: record.outcome === "NO_SHOW" ? new Date(record.scheduledAt as string) : null,
              syntheticBatchId: batch.id,
            },
          });
          reservationId = reservation.id;
        }
        if (record.outcome === "SEATED") {
          const seatedAt = new Date(record.seatedAt as string);
          const clearedAt = new Date(record.clearedAt as string);
          const availableAt = new Date(record.availableAt as string);
          await tx.diningSession.create({
            data: {
              restaurantId: batch.restaurantId,
              diningTableId: table.id,
              queueEntryId,
              reservationId,
              partySize: record.partySize,
              status: "COMPLETED",
              seatedAt,
              clearedAt,
              cleaningStartedAt: clearedAt,
              availableAt,
              completedAt: availableAt,
              syntheticBatchId: batch.id,
            },
          });
          await tx.tableStatusEvent.createMany({
            data: [
              { restaurantId: batch.restaurantId, diningTableId: table.id, fromStatus: "AVAILABLE", toStatus: "OCCUPIED", occurredAt: seatedAt, sourceCommandId: randomUUID(), reason: `Synthetic import ${record.recordId}`, syntheticBatchId: batch.id },
              { restaurantId: batch.restaurantId, diningTableId: table.id, fromStatus: "OCCUPIED", toStatus: "CLEANING", occurredAt: clearedAt, sourceCommandId: randomUUID(), reason: `Synthetic import ${record.recordId}`, syntheticBatchId: batch.id },
              { restaurantId: batch.restaurantId, diningTableId: table.id, fromStatus: "CLEANING", toStatus: "AVAILABLE", occurredAt: availableAt, sourceCommandId: randomUUID(), reason: `Synthetic import ${record.recordId}`, syntheticBatchId: batch.id },
            ],
          });
        }
      }
      await tx.syntheticImportBatch.update({ where: { id: batch.id }, data: { status: "APPLIED", appliedAt: new Date() } });
      await tx.adminAuditLog.create({
        data: {
          restaurantId: batch.restaurantId,
          actorProfileId: user.id,
          actorMembershipId: batch.actorMembershipId,
          action: "DATA_LAB_APPLY",
          targetType: "SyntheticImportBatch",
          targetId: batch.id,
          details: { checksum: batch.checksum, rowCount: batch.rowCount },
          ipHash,
        },
      });
      await tx.restaurant.update({ where: { id: batch.restaurantId }, data: { lastOperationalUpdateAt: new Date(), revision: { increment: 1 } } });
    }, { isolationLevel: "Serializable", maxWait: 5_000, timeout: 30_000 });
    await setFlash("message", "Synthetic history applied atomically to the TEST restaurant.");
  } catch (error) {
    const reference = reportDataError("data-lab-apply", error);
    await setFlash("error", `${error instanceof Error ? error.message : "Could not apply the import."} Support reference: ${reference}`);
  }
  redirect("/admin/data-lab");
}

export async function revertDataLabImport(formData: FormData) {
  const { user, ipHash } = await requireDataLabAdmin();
  const batchId = String(formData.get("batchId") ?? "");
  try {
    await prisma.$transaction(async (tx) => {
      const batch = await tx.syntheticImportBatch.findFirst({
        where: { id: batchId, status: "APPLIED", restaurant: { environment: "TEST" } },
      });
      if (!batch) throw new Error("Only an applied TEST import can be reverted.");
      const importedTableIds = (
        await tx.diningTable.findMany({
          where: { syntheticBatchId: batch.id },
          select: { id: true },
        })
      ).map((table) => table.id);
      if (importedTableIds.length) {
        const [laterEvents, laterSessions, laterAssignments] = await Promise.all([
          tx.tableStatusEvent.count({
            where: {
              diningTableId: { in: importedTableIds },
              OR: [
                { syntheticBatchId: null },
                { syntheticBatchId: { not: batch.id } },
              ],
            },
          }),
          tx.diningSession.count({
            where: {
              diningTableId: { in: importedTableIds },
              OR: [
                { syntheticBatchId: null },
                { syntheticBatchId: { not: batch.id } },
              ],
            },
          }),
          tx.seatingAssignmentTable.count({
            where: {
              diningTableId: { in: importedTableIds },
              diningSession: {
                OR: [
                  { syntheticBatchId: null },
                  { syntheticBatchId: { not: batch.id } },
                ],
              },
            },
          }),
        ]);
        if (laterEvents || laterSessions || laterAssignments) {
          throw new Error(
            "This batch created a table that later operations now use. Archive or move those later TEST records before reverting the import.",
          );
        }
      }
      await tx.tableStatusEvent.deleteMany({ where: { syntheticBatchId: batch.id } });
      await tx.diningSession.deleteMany({ where: { syntheticBatchId: batch.id } });
      await tx.queueEntry.deleteMany({ where: { syntheticBatchId: batch.id } });
      await tx.reservation.deleteMany({ where: { syntheticBatchId: batch.id } });
      await tx.diningTable.deleteMany({ where: { syntheticBatchId: batch.id } });
      await tx.syntheticImportBatch.update({ where: { id: batch.id }, data: { status: "REVERTED", revertedAt: new Date() } });
      await tx.adminAuditLog.create({
        data: {
          restaurantId: batch.restaurantId,
          actorProfileId: user.id,
          actorMembershipId: batch.actorMembershipId,
          action: "DATA_LAB_REVERT",
          targetType: "SyntheticImportBatch",
          targetId: batch.id,
          details: { checksum: batch.checksum, rowCount: batch.rowCount },
          ipHash,
        },
      });
    }, { isolationLevel: "Serializable", maxWait: 5_000, timeout: 30_000 });
    await setFlash("message", "Synthetic rows were reverted. Import and audit metadata were retained.");
  } catch (error) {
    const reference = reportDataError("data-lab-revert", error);
    await setFlash("error", `${error instanceof Error ? error.message : "Could not revert the import."} Support reference: ${reference}`);
  }
  redirect("/admin/data-lab");
}
