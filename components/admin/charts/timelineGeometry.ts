export type TimelinePoint = {
  label: string;
  primary: number;
  secondary: number;
  compareSecondary?: number;
  rangeLabel?: string;
};

export type TimelineBucket = TimelinePoint & {
  startLabel: string;
  endLabel: string;
  sourceCount: number;
};

export function getTimelineBucketCount(pointCount: number, availableWidth: number) {
  if (pointCount <= 0) return 0;
  const usable = Math.max(120, availableWidth - 58);
  return Math.max(1, Math.min(pointCount, Math.floor(usable / 24)));
}

export function bucketTimelinePoints(
  points: TimelinePoint[],
  bucketCount: number,
): TimelineBucket[] {
  if (points.length === 0 || bucketCount <= 0) return [];
  const count = Math.min(points.length, Math.max(1, Math.floor(bucketCount)));
  const buckets: TimelineBucket[] = [];
  for (let bucketIndex = 0; bucketIndex < count; bucketIndex += 1) {
    const start = Math.floor((bucketIndex * points.length) / count);
    const end = Math.floor(((bucketIndex + 1) * points.length) / count);
    const source = points.slice(start, Math.max(start + 1, end));
    const first = source[0]!;
    const last = source[source.length - 1]!;
    const hasCompare = source.some((point) => point.compareSecondary !== undefined);
    buckets.push({
      label: first.label === last.label ? first.label : `${first.label}–${last.label}`,
      rangeLabel: first.label === last.label ? first.label : `${first.label} to ${last.label}`,
      startLabel: first.label,
      endLabel: last.label,
      sourceCount: source.length,
      primary: source.reduce((sum, point) => sum + Math.max(0, point.primary || 0), 0),
      secondary: source.reduce((sum, point) => sum + Math.max(0, point.secondary || 0), 0),
      compareSecondary: hasCompare
        ? source.reduce((sum, point) => sum + Math.max(0, point.compareSecondary ?? 0), 0)
        : undefined,
    });
  }
  return buckets;
}

export function createCountTicks(values: number[], tickCount = 4) {
  const maximum = Math.max(0, ...values.filter(Number.isFinite));
  if (maximum === 0) return { max: 1, ticks: [0, 1] };
  const targetStep = maximum / Math.max(1, tickCount);
  const magnitude = 10 ** Math.floor(Math.log10(targetStep));
  const normalized = targetStep / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = nice * magnitude;
  const max = Math.ceil(maximum / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= max + step / 2; value += step) ticks.push(value);
  return { max, ticks };
}

export function getLabelIndices(pointCount: number, availableWidth: number) {
  if (pointCount <= 0) return [];
  if (pointCount === 1) return [0];
  const maximumLabels = Math.max(2, Math.floor(Math.max(160, availableWidth - 58) / 72));
  const step = Math.max(1, Math.ceil((pointCount - 1) / (maximumLabels - 1)));
  const indices: number[] = [];
  for (let index = 0; index < pointCount; index += step) indices.push(index);
  if (indices[indices.length - 1] !== pointCount - 1) indices.push(pointCount - 1);
  return indices;
}

export function getTimelineLayout(width: number) {
  return {
    compact: width < 600,
    chartHeight: width < 600 ? 238 : 278,
    insetLeft: width < 600 ? 42 : 50,
    insetRight: 12,
  } as const;
}
