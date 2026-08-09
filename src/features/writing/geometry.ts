/** Canvas座標・端末座標を問わず扱える、有限な二次元の書字点。 */
export type WritingPoint = readonly [number, number];

/** ひと筆分の順序付き書字点列。 */
export type WritingStroke = readonly WritingPoint[];

/** 一文字分の順序付き書字ストローク。 */
export type WritingStrokes = readonly WritingStroke[];

/** 数値を閉区間へ安全に収める。 */
export function clamp(value: number, minimum = 0, maximum = 1): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

/** 点が採点・描画可能な有限座標かを検査する。 */
export function isFinitePoint(point: unknown): point is WritingPoint {
  return Array.isArray(point)
    && point.length === 2
    && typeof point[0] === "number"
    && typeof point[1] === "number"
    && Number.isFinite(point[0])
    && Number.isFinite(point[1]);
}

/** 点列がすべて有限座標かを検査し、変更しないコピーとして返す。 */
function copyFinitePoints(points: readonly WritingPoint[]): WritingPoint[] | null {
  if (!points.every(isFinitePoint)) return null;
  return points.map(([x, y]) => [x, y] as const);
}

/**
 * 点列を弧長に沿って等間隔へ再サンプリングする。
 *
 * `count` は2以上でなければならない。空入力は空配列、1点または全長0の入力は
 * 同じ点を `count` 回返す。非有限な点を含む入力は空配列へ安全に退避する。
 */
export function resample(points: readonly WritingPoint[], count: number): WritingPoint[] {
  if (!Number.isInteger(count) || count < 2) {
    throw new RangeError("resample count must be an integer of at least 2");
  }

  const copied = copyFinitePoints(points);
  if (copied === null || copied.length === 0) return [];
  if (copied.length === 1) return Array.from({ length: count }, () => copied[0]);

  const lengths = [0];
  for (let index = 1; index < copied.length; index += 1) {
    const [previousX, previousY] = copied[index - 1];
    const [currentX, currentY] = copied[index];
    lengths.push(lengths[index - 1] + Math.hypot(currentX - previousX, currentY - previousY));
  }

  const totalLength = lengths.at(-1)!;
  if (!Number.isFinite(totalLength) || totalLength <= Number.EPSILON) {
    return Array.from({ length: count }, () => copied[0]);
  }

  const result: WritingPoint[] = [];
  let segment = 1;
  for (let index = 0; index < count; index += 1) {
    if (index === 0) {
      result.push(copied[0]);
      continue;
    }
    if (index === count - 1) {
      result.push(copied.at(-1)!);
      continue;
    }

    const target = (totalLength * index) / (count - 1);
    while (segment < lengths.length - 1 && lengths[segment] < target) segment += 1;
    const before = segment - 1;
    const segmentLength = lengths[segment] - lengths[before];
    if (segmentLength <= Number.EPSILON) {
      result.push(copied[segment]);
      continue;
    }
    const progress = clamp((target - lengths[before]) / segmentLength);
    const [fromX, fromY] = copied[before];
    const [toX, toY] = copied[segment];
    result.push([fromX + ((toX - fromX) * progress), fromY + ((toY - fromY) * progress)]);
  }

  return result;
}

/**
 * すべてのstrokeを共通の等方scaleで0..1座標へ正規化する。
 *
 * 短い辺には中央の余白を残し、x/yを別々に伸縮しない。空strokeと非有限strokeは
 * 空として残し、入力配列・点配列はいっさい変更しない。
 */
export function normalizeWriting(strokes: WritingStrokes): WritingPoint[][] {
  const copied = strokes.map((stroke) => copyFinitePoints(stroke) ?? []);
  const points = copied.flat();
  if (points.length === 0) return copied;

  let minimumX = points[0][0];
  let maximumX = minimumX;
  let minimumY = points[0][1];
  let maximumY = minimumY;
  for (const [x, y] of points) {
    minimumX = Math.min(minimumX, x);
    maximumX = Math.max(maximumX, x);
    minimumY = Math.min(minimumY, y);
    maximumY = Math.max(maximumY, y);
  }

  const width = maximumX - minimumX;
  const height = maximumY - minimumY;
  const extent = Math.max(width, height);
  if (!Number.isFinite(extent) || extent <= Number.EPSILON) {
    return copied.map((stroke) => stroke.map(() => [0.5, 0.5] as const));
  }

  const offsetX = (extent - width) / 2;
  const offsetY = (extent - height) / 2;
  return copied.map((stroke) => stroke.map(([x, y]) => [
    clamp(((x - minimumX) + offsetX) / extent),
    clamp(((y - minimumY) + offsetY) / extent),
  ] as const));
}
