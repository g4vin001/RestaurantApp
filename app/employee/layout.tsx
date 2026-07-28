import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ROLE_HOME } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/employee");

  const profile = await prisma.profile.findUnique({ where: { id: user.id } });
  // Managers oversee the floor too, so they're allowed into the employee view.
  if (profile?.role !== "EMPLOYEE" && profile?.role !== "MANAGER") {
    redirect(ROLE_HOME[profile?.role ?? "CUSTOMER"]);
  }

  return <>{children}</>;
}
