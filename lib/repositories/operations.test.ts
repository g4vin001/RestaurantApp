import { describe, expect, it } from "vitest";
import { DemoOperationsRepository } from "./demo/demo-operations";
import {
  databaseWritePending,
  resolveOperationsRepositoryMode,
} from "./operations";

describe("operations repository selection", () => {
  it("uses the browser repository only for explicit demo mode", () => {
    expect(resolveOperationsRepositoryMode("true")).toBe("demo");
    expect(resolveOperationsRepositoryMode("false")).toBe("database");
    expect(resolveOperationsRepositoryMode(undefined)).toBe("database");
  });

  it("loads deterministic fixtures from the demo repository", async () => {
    const now = new Date("2026-08-03T08:00:00+08:00");
    const repository = new DemoOperationsRepository(() => now);

    expect(await repository.loadSnapshot()).toEqual(
      await repository.loadSnapshot(),
    );
    expect(repository.mode).toBe("demo");
  });

  it("returns an explicit error while database commands are pending", () => {
    expect(databaseWritePending()).toEqual({
      ok: false,
      error:
        "This screen is reading shared restaurant data, but database writes are not enabled for this action yet.",
    });
  });
});
