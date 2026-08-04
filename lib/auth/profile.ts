import "server-only";
import type { User } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";

function profileName(user: User, requestedName?: string) {
  const metadataName =
    typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : "";
  const emailName = user.email?.split("@")[0] ?? "Halina user";
  return requestedName?.trim() || metadataName.trim() || emailName;
}

export async function ensureProfile(user: User, requestedName?: string) {
  if (!user.email) {
    throw new Error("An email address is required to create a Halina profile.");
  }

  return prisma.profile.upsert({
    where: { id: user.id },
    create: {
      id: user.id,
      email: user.email,
      displayName: profileName(user, requestedName),
    },
    update: {
      email: user.email,
    },
  });
}
