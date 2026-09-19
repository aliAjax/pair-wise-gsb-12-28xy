import type { Task, Vehicle } from "../types";
import { overlapRange, toTs } from "./time";

/** 占用车辆/司机的任务状态：待执行与执行中都算占用；已完成、已取消释放 */
export const OCCUPYING_STATUSES: readonly Task["status"][] = ["待执行", "执行中"];

export type Conflict =
  | { kind: "vehicle"; task: Task; overlapStart: number; overlapEnd: number }
  | { kind: "driver"; task: Task; overlapStart: number; overlapEnd: number }
  | { kind: "capacity"; vehicle: Vehicle; weightKg: number; excessKg: number };

export interface ConflictCandidate {
  vehicleId: string;
  driverId: string;
  weightKg: number;
  start: string;
  end: string;
}

/**
 * 检查一个派单候选与现有占用任务的冲突。
 * - 同一车辆时段重叠 -> vehicle 冲突（带重叠时段）
 * - 同一司机时段重叠 -> driver 冲突（带重叠时段）
 * - 货重超过车辆载重 -> capacity 冲突（带超重差额）
 * 跨日班次按 [start, end] 连续区间参与重叠判断。
 */
export function findConflicts(
  candidate: ConflictCandidate,
  tasks: readonly Task[],
  vehicles: readonly Vehicle[],
  excludeTaskId?: string
): Conflict[] {
  const conflicts: Conflict[] = [];
  const start = toTs(candidate.start);
  const end = toTs(candidate.end);
  const timeValid = Number.isFinite(start) && Number.isFinite(end) && start < end;

  if (timeValid) {
    for (const task of tasks) {
      if (task.id === excludeTaskId) continue;
      if (!OCCUPYING_STATUSES.includes(task.status)) continue;
      if (task.vehicleId !== candidate.vehicleId && task.driverId !== candidate.driverId) continue;
      const overlap = overlapRange(start, end, toTs(task.start), toTs(task.end));
      if (!overlap) continue;
      if (task.vehicleId === candidate.vehicleId) {
        conflicts.push({ kind: "vehicle", task, overlapStart: overlap.start, overlapEnd: overlap.end });
      }
      if (task.driverId === candidate.driverId) {
        conflicts.push({ kind: "driver", task, overlapStart: overlap.start, overlapEnd: overlap.end });
      }
    }
  }

  const vehicle = vehicles.find((item) => item.id === candidate.vehicleId);
  if (vehicle && candidate.weightKg > vehicle.capacityKg) {
    conflicts.push({
      kind: "capacity",
      vehicle,
      weightKg: candidate.weightKg,
      excessKg: candidate.weightKg - vehicle.capacityKg
    });
  }

  return conflicts;
}
