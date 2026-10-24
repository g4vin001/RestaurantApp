import { describe, expect, it } from "vitest";
import { ordinal } from "./helpers";

describe("ordinal", () => {
  it("formats queue places, including the 11th–13th exceptions", () => {
    expect([1, 2, 3, 4, 10].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "10th"]);
    expect([11, 12, 13].map(ordinal)).toEqual(["11th", "12th", "13th"]);
    expect([21, 22, 23, 101, 111, 112].map(ordinal)).toEqual(["21st", "22nd", "23rd", "101st", "111th", "112th"]);
  });
});
