import type { TaskStatus } from "./types";

export const ZONES = ["城北", "城东", "城南"] as const;

export const TASK_STATUSES: readonly TaskStatus[] = ["待执行", "执行中", "已完成", "已取消"];
