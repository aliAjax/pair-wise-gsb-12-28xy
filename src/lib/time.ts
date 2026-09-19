/** 时间工具：时段一律按完整时间戳比较，跨日班次天然是连续区间。 */

export function toTs(iso: string): number {
  return new Date(iso).getTime();
}

/** 两个区间 [aStart,aEnd) 与 [bStart,bEnd) 的重叠部分；不重叠返回 null */
export function overlapRange(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): { start: number; end: number } | null {
  const start = Math.max(aStart, bStart);
  const end = Math.min(aEnd, bEnd);
  return start < end ? { start, end } : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 09-19 14:00 */
export function formatDateTime(isoOrTs: string | number): string {
  const d = new Date(isoOrTs);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function isCrossDay(startIso: string, endIso: string): boolean {
  const s = new Date(startIso);
  const e = new Date(endIso);
  return (
    s.getFullYear() !== e.getFullYear() ||
    s.getMonth() !== e.getMonth() ||
    s.getDate() !== e.getDate()
  );
}

/** 09-19 22:00 ~ 09-20 06:00（跨日） */
export function formatWindow(startIso: string, endIso: string): string {
  const text = `${formatDateTime(startIso)} ~ ${formatDateTime(endIso)}`;
  return isCrossDay(startIso, endIso) ? `${text}（跨日）` : text;
}

/** ISO 串 -> datetime-local 输入框值（本地时区） */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local 输入框值 -> ISO 串 */
export function fromLocalInput(value: string): string {
  return new Date(value).toISOString();
}
