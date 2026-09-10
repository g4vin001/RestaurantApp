export const CUSTOMER_FRESHNESS_MS = 45_000;

export type CustomerConnection = {
  online: boolean;
  channel: "polling" | "connecting" | "subscribed" | "error";
  refreshing: boolean;
  failed: boolean;
  confirmed: boolean;
  checkedAt: number;
};

export function customerConnectionStatus(state: CustomerConnection, now: number) {
  if (!state.online) return "offline";
  if (state.failed || now - state.checkedAt > CUSTOMER_FRESHNESS_MS) return "stale";
  if (!state.confirmed) return "checking";
  if (state.channel === "subscribed") return "live";
  if (state.channel === "polling") return "current";
  return "periodic";
}
