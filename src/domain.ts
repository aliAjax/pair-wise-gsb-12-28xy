/**
 * 派单闭环领域逻辑：时段解析（含跨日）、占用重叠、载重校验、修订链。
 * 全部为纯函数，便于在 store 之外复用与测试。
 */

export type OrderStatus = "待执行" | "执行中" | "已完成";

export const ORDER_STATUSES: readonly OrderStatus[] = ["待执行", "执行中", "已完成"];

export interface Vehicle {
  id: string;
  plate: string; // 车牌号
  capacityKg: number; // 载重（kg）
}

export interface Driver {
  id: string;
  name: string;
}

export interface Order {
  id: string;
  orderNo: string; // 派单号，如 D-0001
  vehicleId: string;
  driverId: string;
  zone: string; // 配送区域
  cargoKg: number; // 货重（kg）
  startAt: string; // 配送时段开始（ISO）
  endAt: string; // 配送时段结束（ISO，跨日已顺延，恒大于 startAt）
  status: OrderStatus;
  notes: string;
  createdAt: string;
  revisionNo: number; // 修订序号，原始单为 1
  sourceId: string | null; // 修订来源订单 id（仅修订单有值）
}

/** 表单草稿：结束时间 <= 开始时间时按次日处理（跨日班次连续占用） */
export interface OrderDraft {
  vehicleId: string;
  driverId: string;
  zone: string;
  cargoKg: number;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  notes: string;
}

export interface ResolvedWindow {
  startAt: string;
  endAt: string;
  crossesMidnight: boolean;
}

/** 把「日期 + 起止时间」解析为连续时间段；结束时间不晚于开始时间则顺延到次日 */
export function resolveWindow(date: string, startTime: string, endTime: string): ResolvedWindow {
  const start = new Date(`${date}T${startTime}:00`);
  let end = new Date(`${date}T${endTime}:00`);
  const crossesMidnight = end.getTime() <= start.getTime();
  if (crossesMidnight) {
    end = new Date(end.getTime() + 24 * 3600 * 1000);
  }
  return { startAt: start.toISOString(), endAt: end.toISOString(), crossesMidnight };
}

/** 两个时间段的交集；不重叠返回 null */
export function overlapRange(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): { start: string; end: string } | null {
  const start = Math.max(Date.parse(aStart), Date.parse(bStart));
  const end = Math.min(Date.parse(aEnd), Date.parse(bEnd));
  return start < end
    ? { start: new Date(start).toISOString(), end: new Date(end).toISOString() }
    : null;
}

export type Conflict =
  | { kind: "vehicle"; orderNo: string; plate: string; overlapStart: string; overlapEnd: string }
  | { kind: "driver"; orderNo: string; driverName: string; overlapStart: string; overlapEnd: string }
  | { kind: "weight"; plate: string; cargoKg: number; capacityKg: number; excessKg: number };

/** 占用判定：已完成订单不再占用车辆/司机 */
export function isActive(order: Order): boolean {
  return order.status !== "已完成";
}

/**
 * 校验一个候选派单：同车/同司机时段重叠、货重超过车辆载重。
 * excludeOrderId 用于编辑时排除自身。
 */
export function findConflicts(
  candidate: { vehicleId: string; driverId: string; cargoKg: number; startAt: string; endAt: string },
  orders: Order[],
  vehicles: Vehicle[],
  drivers: Driver[],
  excludeOrderId?: string
): Conflict[] {
  const conflicts: Conflict[] = [];
  const vehicle = vehicles.find((item) => item.id === candidate.vehicleId);

  if (vehicle && candidate.cargoKg > vehicle.capacityKg) {
    conflicts.push({
      kind: "weight",
      plate: vehicle.plate,
      cargoKg: candidate.cargoKg,
      capacityKg: vehicle.capacityKg,
      excessKg: candidate.cargoKg - vehicle.capacityKg
    });
  }

  for (const order of orders) {
    if (order.id === excludeOrderId || !isActive(order)) continue;
    const range = overlapRange(candidate.startAt, candidate.endAt, order.startAt, order.endAt);
    if (!range) continue;
    if (order.vehicleId === candidate.vehicleId && vehicle) {
      conflicts.push({
        kind: "vehicle",
        orderNo: order.orderNo,
        plate: vehicle.plate,
        overlapStart: range.start,
        overlapEnd: range.end
      });
    }
    if (order.driverId === candidate.driverId) {
      const driver = drivers.find((item) => item.id === candidate.driverId);
      conflicts.push({
        kind: "driver",
        orderNo: order.orderNo,
        driverName: driver?.name ?? "未知司机",
        overlapStart: range.start,
        overlapEnd: range.end
      });
    }
  }
  return conflicts;
}

/** 修订链：返回 rootId -> 链上全部订单（按修订序号排序） */
export function groupChains(orders: Order[]): Map<string, Order[]> {
  const byId = new Map(orders.map((order) => [order.id, order]));
  const rootOf = (order: Order): string => {
    let current = order;
    const seen = new Set<string>([current.id]);
    while (current.sourceId && byId.has(current.sourceId) && !seen.has(current.sourceId)) {
      current = byId.get(current.sourceId)!;
      seen.add(current.id);
    }
    return current.id;
  };
  const chains = new Map<string, Order[]>();
  for (const order of orders) {
    const rootId = rootOf(order);
    const chain = chains.get(rootId) ?? [];
    chain.push(order);
    chains.set(rootId, chain);
  }
  for (const chain of chains.values()) {
    chain.sort((a, b) => a.revisionNo - b.revisionNo || a.createdAt.localeCompare(b.createdAt));
  }
  return chains;
}

export function nextOrderNo(counter: number): string {
  return `D-${String(counter).padStart(4, "0")}`;
}

const pad = (value: number) => String(value).padStart(2, "0");

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 时段展示：同日省略结束日期，跨日标注「跨日」 */
export function fmtWindow(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const sameDay = start.toDateString() === end.toDateString();
  return sameDay
    ? `${fmtDateTime(startAt)} ~ ${pad(end.getHours())}:${pad(end.getMinutes())}`
    : `${fmtDateTime(startAt)} ~ ${fmtDateTime(endAt)}（跨日）`;
}

export function fmtHours(startIso: string, endIso: string): string {
  const hours = (Date.parse(endIso) - Date.parse(startIso)) / 3600000;
  return `${Number(hours.toFixed(1))} 小时`;
}

export function toLocalDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toLocalTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 冲突描述文案：列出冲突车辆、司机、重叠时段和超重差额 */
export function describeConflict(conflict: Conflict): string {
  switch (conflict.kind) {
    case "vehicle":
      return `车辆 ${conflict.plate} 与派单 ${conflict.orderNo} 冲突：重叠时段 ${fmtWindow(conflict.overlapStart, conflict.overlapEnd)}（${fmtHours(conflict.overlapStart, conflict.overlapEnd)}）`;
    case "driver":
      return `司机 ${conflict.driverName} 与派单 ${conflict.orderNo} 冲突：重叠时段 ${fmtWindow(conflict.overlapStart, conflict.overlapEnd)}（${fmtHours(conflict.overlapStart, conflict.overlapEnd)}）`;
    case "weight":
      return `货重 ${conflict.cargoKg} kg 超过车辆 ${conflict.plate} 载重 ${conflict.capacityKg} kg，超重差额 ${conflict.excessKg} kg`;
  }
}
