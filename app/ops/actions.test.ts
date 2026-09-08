import { beforeEach, describe, expect, it, vi } from "vitest";
import { moveStaffReservationTable, seatStaffQueueEntry, seatStaffReservation } from "./actions";

const boundary = vi.hoisted(() => ({ context: vi.fn(), execute: vi.fn(), flash: vi.fn(), broadcast: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/staff/access", () => ({ getCurrentWorkContext: boundary.context }));
vi.mock("@/lib/repositories/prisma/operations-commands", () => ({ executeOperationsCommand: boundary.execute }));
vi.mock("@/lib/flash", () => ({ setFlash: boundary.flash }));
vi.mock("@/lib/realtime/invalidation", () => ({ broadcastRestaurantInvalidation: boundary.broadcast }));
vi.mock("@/lib/server/data-error", () => ({ reportDataError: vi.fn(() => "test-reference") }));

// These cover form-to-command dispatch; persistence is covered separately by
// the Prisma integration suite and is deliberately not simulated here.
describe("staff seating action boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    boundary.context.mockResolvedValue({
      profileId: "staff", restaurantId: "restaurant", membershipId: "membership",
      permissions: ["SEAT_PARTIES"], restaurantSlug: "test-kitchen", restaurantEnvironment: "TEST",
    });
    boundary.execute.mockResolvedValue(undefined);
    boundary.broadcast.mockResolvedValue(undefined);
  });
  it.each([
    [seatStaffQueueEntry, "queueId", "SEAT_QUEUE"],
    [seatStaffReservation, "reservationId", "SEAT_RESERVATION"],
    [moveStaffReservationTable, "reservationId", "MOVE_RESERVATION_TABLE"],
  ] as const)("preserves pair selection for %s", async (action, source, type) => {
    const form = new FormData();
    form.set(source, "party"); form.set("expectedRevision", "7");
    form.append("tableIds", "table-one"); form.append("tableIds", "table-two");
    await action(form);
    expect(boundary.execute).toHaveBeenCalledWith({}, expect.objectContaining({
      restaurantId: "restaurant", membershipRole: "STAFF", permissions: ["SEAT_PARTIES"],
    }), expect.objectContaining({ type, expectedRevision: 7, tableIds: ["table-one", "table-two"] }));
    expect(boundary.broadcast).toHaveBeenCalledWith({}, expect.objectContaining({ restaurantId: "restaurant" }));
  });
  it("rejects an ended work session before dispatching a command", async () => {
    boundary.context.mockResolvedValue(null);
    await seatStaffQueueEntry(new FormData());
    expect(boundary.execute).not.toHaveBeenCalled();
    expect(boundary.broadcast).not.toHaveBeenCalled();
    expect(boundary.flash).toHaveBeenCalledWith("error", expect.stringContaining("clock in again"));
  });
});
