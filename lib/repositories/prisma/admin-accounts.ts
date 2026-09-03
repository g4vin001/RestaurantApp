import "server-only";
import type { PrismaClient } from "@/lib/generated/prisma/client";

export type DeleteAccountAsAdminInput = {
  profileId: string;
  actorProfileId: string;
  reason: string;
  ipHash?: string;
};

export type DeleteAccountAsAdminResult = { email: string };

// Profile has three onDelete: Restrict relations, unlike everything else
// which cascades or nulls out — they exist deliberately to protect
// audit/provenance trails (a staff invite's origin, an admin action's actor,
// a Data Lab import's actor) from silently losing their identity. Checked
// up front so the admin gets a specific reason instead of a raw FK error.
export async function deleteAccountAsAdmin(
  client: PrismaClient,
  input: DeleteAccountAsAdminInput,
): Promise<DeleteAccountAsAdminResult> {
  return client.$transaction(async (transaction) => {
    const profile = await transaction.profile.findUnique({
      where: { id: input.profileId },
      select: { id: true, email: true, displayName: true },
    });
    if (!profile) throw new Error("Account not found.");

    const [staffInviteCount, adminAuditLogCount, importBatchCount] = await Promise.all([
      transaction.staffInvite.count({ where: { createdById: input.profileId } }),
      transaction.adminAuditLog.count({ where: { actorProfileId: input.profileId } }),
      transaction.syntheticImportBatch.count({ where: { actorProfileId: input.profileId } }),
    ]);
    if (staffInviteCount > 0) {
      throw new Error("Can't delete: this account created staff invites that must stay attributed.");
    }
    if (adminAuditLogCount > 0) {
      throw new Error("Can't delete: this account has admin audit history that must stay attributed.");
    }
    if (importBatchCount > 0) {
      throw new Error("Can't delete: this account ran Data Lab imports that must stay attributed.");
    }

    await transaction.profile.delete({ where: { id: input.profileId } });

    await transaction.adminAuditLog.create({
      data: {
        actorProfileId: input.actorProfileId,
        action: "ACCOUNT_DELETED",
        targetType: "Profile",
        targetId: profile.id,
        details: { email: profile.email, displayName: profile.displayName, reason: input.reason },
        ipHash: input.ipHash,
      },
    });

    return { email: profile.email };
  }, { isolationLevel: "Serializable" });
}
