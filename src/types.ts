export type TaskStatus = "待执行" | "执行中" | "已完成" | "已取消";

export interface Vehicle {
  id: string;
  plate: string;
  capacityKg: number;
}

export interface Driver {
  id: string;
  name: string;
}

export interface Task {
  id: string;
  title: string;
  vehicleId: string;
  driverId: string;
  zone: string;
  weightKg: number;
  /** ISO 时间串，配送时段开始 */
  start: string;
  /** ISO 时间串，配送时段结束；跨日班次按 [start, end] 连续占用处理 */
  end: string;
  status: TaskStatus;
  notes: string;
  /** 修订来源任务 id；首单为 null */
  sourceId: string | null;
  /** 修订序号，首单为 0 */
  revision: number;
  createdAt: string;
}

/** 表单草稿：新建 / 编辑 / 修订共用 */
export interface TaskDraft {
  title: string;
  vehicleId: string;
  driverId: string;
  zone: string;
  weightKg: number;
  start: string;
  end: string;
  notes: string;
}

/** 派单表单模式：新建 / 编辑 / 基于已完成任务新建修订 */
export type FormMode =
  | { kind: "create" }
  | { kind: "edit"; taskId: string }
  | { kind: "revise"; sourceId: string };

export type SaveResult = {
  ok: boolean;
  message?: string;
  conflicts?: import("./lib/conflicts").Conflict[];
};
