import { describe, it, expect } from "vitest";
import { selectBroadcastTargets } from "../../apps/desktop/src/contracts/note-broadcast";

describe("note-broadcast — selectBroadcastTargets", () => {
  it("excludes the sender window", () => {
    const windows = [
      { id: 1, destroyed: false },
      { id: 2, destroyed: false },
      { id: 3, destroyed: false }
    ];
    expect(selectBroadcastTargets(windows, 2)).toEqual([1, 3]);
  });

  it("excludes destroyed windows", () => {
    const windows = [
      { id: 1, destroyed: false },
      { id: 2, destroyed: true },
      { id: 3, destroyed: false }
    ];
    expect(selectBroadcastTargets(windows, 1)).toEqual([3]);
  });

  it("broadcasts to all live windows when senderId is undefined", () => {
    const windows = [
      { id: 1, destroyed: false },
      { id: 2, destroyed: true },
      { id: 3, destroyed: false }
    ];
    expect(selectBroadcastTargets(windows, undefined)).toEqual([1, 3]);
  });

  it("returns an empty list when only the sender is live", () => {
    expect(selectBroadcastTargets([{ id: 1, destroyed: false }], 1)).toEqual([]);
  });

  it("returns an empty list when all windows are destroyed", () => {
    expect(
      selectBroadcastTargets(
        [
          { id: 1, destroyed: true },
          { id: 2, destroyed: true }
        ],
        undefined
      )
    ).toEqual([]);
  });
});