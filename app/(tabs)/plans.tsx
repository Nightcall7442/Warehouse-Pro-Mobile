// Warehouse Pro — Visit Plans (matches shops.tsx card language)
import { useAuthStore } from "../../src/store/auth";
import { SupervisorPlansView, AgentPlansView } from "../../src/components/plans";

// ── Main screen — role-based routing ──────────────────────────────────────────
// NB: Plans/route-management is ceo+supervisor only on the backend (see
// api/agent-router.ts — listAgents, listShopsForPlan, createPlan all use
// supervisorQuery, which only allows ["ceo","supervisor"]). "operator" must
// NOT be routed into SupervisorPlansView or its queries/mutations will 403.
export default function PlansScreen() {
  const { user } = useAuthStore();
  const isSupervisor = user?.role === "supervisor" || user?.role === "ceo";

  if (isSupervisor) {
    return <SupervisorPlansView />;
  }
  return <AgentPlansView />;
}
