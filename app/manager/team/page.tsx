import { TeamManager } from "@/components/manager/TeamManager";
import { DatabaseTeamManager } from "@/components/manager/DatabaseTeamManager";

export const dynamic = "force-dynamic";

export default function TeamPage() {
  if (process.env.NEXT_PUBLIC_HALINA_DEMO_MODE === "true") {
    return <TeamManager />;
  }
  return <DatabaseTeamManager />;
}
