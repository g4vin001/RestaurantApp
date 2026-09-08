export type StaffConnectionState = {
  online: boolean;
  channel: "connecting" | "subscribed" | "error" | "closed";
  refreshing: boolean;
  fresh: boolean;
  failed: boolean;
  changedElsewhere: boolean;
};

export const initialStaffConnection: StaffConnectionState = {
  online: true, channel: "connecting", refreshing: false,
  fresh: false, failed: false, changedElsewhere: false,
};

export type StaffConnectionEvent =
  | { type: "OFFLINE" | "CONNECTING" | "SUBSCRIBED" | "CHANNEL_ERROR" | "CLOSED" | "SNAPSHOT_RECEIVED" | "REFRESH_FAILED" }
  | { type: "REFRESH_STARTED"; changedElsewhere: boolean };

export function staffConnectionReducer(state: StaffConnectionState, event: StaffConnectionEvent): StaffConnectionState {
  switch (event.type) {
    case "OFFLINE": return { ...state, online: false, channel: "connecting", fresh: false, refreshing: false };
    case "CONNECTING": return { ...state, online: true, channel: "connecting", fresh: false };
    case "SUBSCRIBED": return { ...state, channel: "subscribed", fresh: false };
    case "CHANNEL_ERROR": return { ...state, channel: "error", fresh: false };
    case "CLOSED": return { ...state, channel: "closed", fresh: false };
    case "REFRESH_STARTED": return { ...state, refreshing: true, failed: false, changedElsewhere: event.changedElsewhere };
    case "SNAPSHOT_RECEIVED": return { ...state, refreshing: false, fresh: state.online, failed: false };
    case "REFRESH_FAILED": return { ...state, refreshing: false, fresh: false, failed: true };
  }
}

export function staffConnectionStatus(state: StaffConnectionState) {
  if (!state.online) return "offline";
  if (state.failed) return "stale";
  if (state.refreshing) return "refreshing";
  if (state.channel === "subscribed" && state.fresh) return "live";
  if (state.channel === "closed") return "stale";
  return "reconnecting";
}
