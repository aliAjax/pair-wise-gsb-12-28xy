import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import type { Driver, SaveResult, Task, TaskDraft, Vehicle } from "../types";
import { findConflicts, OCCUPYING_STATUSES } from "../lib/conflicts";
import { toTs } from "../lib/time";

const STORAGE_KEY = "dfwlfront-3-dispatch";
const STORAGE_VERSION = 2;

const HOUR = 3600_000;

interface PersistedState {
  version: number;
  vehicles: Vehicle[];
  drivers: Driver[];
  tasks: Task[];
}

function seedState(): PersistedState {
  const now = Date.now();
  const iso = (ts: number) => new Date(ts).toISOString();

  // 跨日班次：就近的 22:00 出发，次日 06:00 返回
  const night = new Date();
  night.setHours(22, 0, 0, 0);
  if (night.getTime() < now - 2 * HOUR) night.setDate(night.getDate() + 1);

  const vehicles: Vehicle[] = [
    { id: "v-1", plate: "沪A-82L6", capacityKg: 1500 },
    { id: "v-2", plate: "沪B-73K9", capacityKg: 800 },
    { id: "v-3", plate: "沪C-66D2", capacityKg: 2000 }
  ];
  const drivers: Driver[] = [
    { id: "d-1", name: "董飞" },
    { id: "d-2", name: "周航" },
    { id: "d-3", name: "林蔚" }
  ];
  const tasks: Task[] = [
    {
      id: "seed-1",
      title: "商超补货",
      vehicleId: "v-1",
      driverId: "d-1",
      zone: "城北",
      weightKg: 600,
      start: iso(now - 30 * HOUR),
      end: iso(now - 27 * HOUR),
      status: "已完成",
      notes: "已签收",
      sourceId: null,
      revision: 0,
      createdAt: iso(now - 32 * HOUR)
    },
    {
      id: "seed-2",
      title: "商超补货",
      vehicleId: "v-1",
      driverId: "d-1",
      zone: "城北",
      weightKg: 650,
      start: iso(now + 20 * HOUR),
      end: iso(now + 23 * HOUR),
      status: "待执行",
      notes: "客户要求加送，按修订重新派单",
      sourceId: "seed-1",
      revision: 1,
      createdAt: iso(now - 2 * HOUR)
    },
    {
      id: "seed-3",
      title: "医药配送",
      vehicleId: "v-2",
      driverId: "d-2",
      zone: "城东",
      weightKg: 300,
      start: iso(now - 2 * HOUR),
      end: iso(now + 3 * HOUR),
      status: "执行中",
      notes: "预计17:30返回",
      sourceId: null,
      revision: 0,
      createdAt: iso(now - 3 * HOUR)
    },
    {
      id: "seed-4",
      title: "冷链夜配",
      vehicleId: "v-3",
      driverId: "d-3",
      zone: "城南",
      weightKg: 1200,
      start: night.toISOString(),
      end: iso(night.getTime() + 8 * HOUR),
      status: "待执行",
      notes: "跨日班次，连续占用",
      sourceId: null,
      revision: 0,
      createdAt: iso(now - HOUR)
    }
  ];
  return { version: STORAGE_VERSION, vehicles, drivers, tasks };
}

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    if (
      parsed?.version !== STORAGE_VERSION ||
      !Array.isArray(parsed.vehicles) ||
      !Array.isArray(parsed.drivers) ||
      !Array.isArray(parsed.tasks)
    ) {
      return seedState();
    }
    return parsed as PersistedState;
  } catch {
    return seedState();
  }
}

export const useDispatchStore = defineStore("dispatch", () => {
  const initial = loadState();
  const vehicles = ref<Vehicle[]>(initial.vehicles);
  const drivers = ref<Driver[]>(initial.drivers);
  const tasks = ref<Task[]>(initial.tasks);

  watch(
    [vehicles, drivers, tasks],
    () => {
      const state: PersistedState = {
        version: STORAGE_VERSION,
        vehicles: vehicles.value,
        drivers: drivers.value,
        tasks: tasks.value
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    },
    { deep: true }
  );

  // ---------- 查询 ----------

  const vehicleById = computed(() => {
    const map = new Map(vehicles.value.map((item) => [item.id, item]));
    return (id: string) => map.get(id);
  });
  const driverById = computed(() => {
    const map = new Map(drivers.value.map((item) => [item.id, item]));
    return (id: string) => map.get(id);
  });
  const taskById = computed(() => {
    const map = new Map(tasks.value.map((item) => [item.id, item]));
    return (id: string) => map.get(id);
  });

  /** 正在占用资源的任务（待执行 + 执行中） */
  const occupyingTasks = computed(() =>
    tasks.value.filter((task) => OCCUPYING_STATUSES.includes(task.status))
  );

  /** 某任务的后续修订（子单），用于展示修订链 */
  function revisionsOf(taskId: string): Task[] {
    return tasks.value
      .filter((task) => task.sourceId === taskId)
      .sort((a, b) => a.revision - b.revision);
  }

  /** 沿 sourceId 找到链根，再收集整条修订链 */
  function chainOf(task: Task): Task[] {
    const byId = new Map(tasks.value.map((item) => [item.id, item]));
    let root = task;
    while (root.sourceId && byId.has(root.sourceId)) {
      root = byId.get(root.sourceId)!;
    }
    const chain: Task[] = [];
    const queue: Task[] = [root];
    while (queue.length) {
      const current = queue.shift()!;
      chain.push(current);
      queue.push(...tasks.value.filter((item) => item.sourceId === current.id));
    }
    return chain;
  }

  /** 以 source 为来源新建修订时，新单将得到的修订号 */
  function nextRevisionOf(source: Task): number {
    return Math.max(...chainOf(source).map((item) => item.revision)) + 1;
  }

  // ---------- 校验 ----------

  function validateDraft(draft: TaskDraft): string[] {
    const errors: string[] = [];
    if (!draft.title.trim()) errors.push("请填写任务名称");
    if (!draft.vehicleId) errors.push("请选择车辆");
    if (!draft.driverId) errors.push("请选择司机");
    if (!draft.zone) errors.push("请选择配送区域");
    if (!(draft.weightKg > 0)) errors.push("货重必须大于 0 kg");
    const start = toTs(draft.start);
    const end = toTs(draft.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      errors.push("请选择完整的配送时段");
    } else if (end <= start) {
      errors.push("结束时间必须晚于开始时间（跨日班次请选择次日的结束时间）");
    }
    return errors;
  }

  // ---------- 动作 ----------

  /** 新建派单；source 存在时作为该已完成任务的修订单 */
  function addTask(draft: TaskDraft, source?: Task): SaveResult {
    if (source && source.status !== "已完成") {
      return { ok: false, message: "只有已完成的任务才能新建修订" };
    }
    const errors = validateDraft(draft);
    if (errors.length) return { ok: false, message: errors.join("；") };
    const conflicts = findConflicts(draft, tasks.value, vehicles.value);
    if (conflicts.length) return { ok: false, conflicts };

    const task: Task = {
      ...draft,
      title: draft.title.trim(),
      id: crypto.randomUUID(),
      status: "待执行",
      sourceId: source?.id ?? null,
      revision: source ? nextRevisionOf(source) : 0,
      createdAt: new Date().toISOString()
    };
    tasks.value = [task, ...tasks.value];
    return { ok: true };
  }

  /** 编辑任务：执行中的任务锁定车辆与司机；已完成/已取消不可改 */
  function updateTask(taskId: string, draft: TaskDraft): SaveResult {
    const task = tasks.value.find((item) => item.id === taskId);
    if (!task) return { ok: false, message: "任务不存在" };
    if (task.status === "已完成") {
      return { ok: false, message: "已完成的任务不可修改，请通过「新建修订」生成带来源的新单" };
    }
    if (task.status === "已取消") {
      return { ok: false, message: "已取消的任务不可修改" };
    }

    const locked = task.status === "执行中";
    const next: TaskDraft = locked
      ? { ...draft, vehicleId: task.vehicleId, driverId: task.driverId }
      : draft;

    const errors = validateDraft(next);
    if (errors.length) return { ok: false, message: errors.join("；") };
    const conflicts = findConflicts(next, tasks.value, vehicles.value, taskId);
    if (conflicts.length) return { ok: false, conflicts };

    Object.assign(task, next, { title: next.title.trim() });
    return { ok: true };
  }

  function startTask(taskId: string) {
    const task = tasks.value.find((item) => item.id === taskId);
    if (task?.status === "待执行") task.status = "执行中";
  }

  function completeTask(taskId: string) {
    const task = tasks.value.find((item) => item.id === taskId);
    if (task?.status === "执行中") task.status = "已完成";
  }

  function cancelTask(taskId: string) {
    const task = tasks.value.find((item) => item.id === taskId);
    if (task?.status === "待执行") task.status = "已取消";
  }

  function addVehicle(plate: string, capacityKg: number): SaveResult {
    const trimmed = plate.trim();
    if (!trimmed) return { ok: false, message: "请填写车牌号" };
    if (!(capacityKg > 0)) return { ok: false, message: "载重必须大于 0 kg" };
    if (vehicles.value.some((item) => item.plate === trimmed)) {
      return { ok: false, message: `车辆 ${trimmed} 已存在` };
    }
    vehicles.value = [...vehicles.value, { id: crypto.randomUUID(), plate: trimmed, capacityKg }];
    return { ok: true };
  }

  function addDriver(name: string): SaveResult {
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, message: "请填写司机姓名" };
    if (drivers.value.some((item) => item.name === trimmed)) {
      return { ok: false, message: `司机 ${trimmed} 已存在` };
    }
    drivers.value = [...drivers.value, { id: crypto.randomUUID(), name: trimmed }];
    return { ok: true };
  }

  return {
    vehicles,
    drivers,
    tasks,
    vehicleById,
    driverById,
    taskById,
    occupyingTasks,
    revisionsOf,
    nextRevisionOf,
    validateDraft,
    addTask,
    updateTask,
    startTask,
    completeTask,
    cancelTask,
    addVehicle,
    addDriver
  };
});
