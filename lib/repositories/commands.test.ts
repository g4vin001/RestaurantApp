import { afterEach, describe, expect, it } from "vitest";
import { newCommandId } from "./commands";

// Same check the server applies to every command ID (operations-commands.ts).
const SERVER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("newCommandId", () => {
  afterEach(() => {
    // Remove the own-property override so the real prototype method shows again.
    delete (globalThis.crypto as { randomUUID?: unknown }).randomUUID;
  });

  it("uses randomUUID when the page is secure", () => {
    expect(newCommandId()).toMatch(SERVER_UUID);
  });

  it("still makes valid, unique IDs on an insecure page without randomUUID", () => {
    // Browsers omit randomUUID on plain-http network addresses.
    Object.defineProperty(globalThis.crypto, "randomUUID", { value: undefined, configurable: true });
    expect(typeof globalThis.crypto.randomUUID).toBe("undefined");
    const ids = Array.from({ length: 200 }, newCommandId);
    for (const id of ids) expect(id).toMatch(SERVER_UUID);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
