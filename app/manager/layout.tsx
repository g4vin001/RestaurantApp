import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ROLE_HOME } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/manager");

  const profile = await prisma.profile.findUnique({ where: { id: user.id } });
  if (profile?.role !== "MANAGER") redirect(ROLE_HOME[profile?.role ?? "CUSTOMER"]);

  return <>{children}</>;
}
