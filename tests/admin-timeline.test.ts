import { describe, expect, test } from "bun:test";

import {
  bucketTimelinePoints,
  createCountTicks,
  getLabelIndices,
  getTimelineBucketCount,
  getTimelineLayout,
  type TimelinePoint,
} from "@/components/admin/charts/timelineGeometry";

const points: TimelinePoint[] = Array.from({ length: 10 }, (_, index) => ({
  label: `D${index + 1}`,
  primary: index + 1,
  secondary: (index + 1) * 2,
  compareSecondary: index % 2 === 0 ? index : undefined,
}));

describe("admin timeline geometry", () => {
  test("buckets dense points in order and preserves totals", () => {
    const buckets = bucketTimelinePoints(points, 3);
    expect(buckets.map((bucket) => bucket.startLabel)).toEqual(["D1", "D4", "D7"]);
    expect(buckets.reduce((sum, bucket) => sum + bucket.primary, 0)).toBe(55);
    expect(buckets.reduce((sum, bucket) => sum + bucket.secondary, 0)).toBe(110);
    expect(buckets.reduce((sum, bucket) => sum + (bucket.compareSecondary ?? 0), 0)).toBe(20);
  });

  test("handles empty, zero, single-point, and missing comparison input", () => {
    expect(bucketTimelinePoints([], 4)).toEqual([]);
    expect(bucketTimelinePoints([{ label: "Now", primary: 0, secondary: 0 }], 4)).toEqual([
      expect.objectContaining({
        label: "Now",
        primary: 0,
        secondary: 0,
        compareSecondary: undefined,
      }),
    ]);
    expect(createCountTicks([0, 0])).toEqual({ max: 1, ticks: [0, 1] });
  });

  test("uses one honest count scale", () => {
    expect(createCountTicks([3, 9, 17])).toEqual({ max: 20, ticks: [0, 5, 10, 15, 20] });
  });

  test("adapts bucket and label density to width", () => {
    expect(getTimelineBucketCount(365, 320)).toBeLessThan(getTimelineBucketCount(365, 1024));
    expect(getLabelIndices(20, 320).length).toBeLessThan(getLabelIndices(20, 1024).length);
    expect(getLabelIndices(1, 320)).toEqual([0]);
  });

  test("switches chart layout at the shared compact breakpoint", () => {
    expect(getTimelineLayout(375).compact).toBe(true);
    expect(getTimelineLayout(768).compact).toBe(false);
  });
});
