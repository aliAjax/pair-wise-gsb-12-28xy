import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import {
  findConflicts,
  fmtWindow,
  groupChains,
  isActive,
  nextOrderNo,
  resolveWindow,
  type Conflict,
  type Driver,
  type Order,
  type OrderDraft,
  type Vehicle
} from "./domain";

const STORAGE_KEY = "dfwlfront-3-dispatch";
const STORAGE_VERSION = 2;

interface PersistedState {
  version: number;
  vehicles: Vehicle[];
  drivers: Driver[];
  orders: Order[];
  counter: number;
}

function at(dayOffset: number, hours: number, minutes: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

function seedState(): PersistedState {
  const vehicles: Vehicle[] = [
    { id: "v-1", plate: "沪A-82L6", capacityKg: 1500 },
    { id: "v-2", plate: "沪B-73K9", capacityKg: 2000 },
    { id: "v-3", plate: "沪C-55P2", capacityKg: 1000 }
  ];
  const drivers: Driver[] = [
    { id: "d-1", name: "董飞" },
    { id: "d-2", name: "周航" },
    { id: "d-3", name: "林岚" }
  ];
  const orders: Order[] = [
    {
      id: "o-1",
      orderNo: "D-0001",
      vehicleId: "v-1",
      driverId: "d-1",
      zone: "城北",
      cargoKg: 600,
      startAt: at(-1, 9, 0),
      endAt: at(-1, 11, 0),
      status: "已完成",
      notes: "商超补货（首单）",
      createdAt: at(-2, 10, 0),
      revisionNo: 1,
      sourceId: null
    },
    {
      id: "o-2",
      orderNo: "D-0002",
      vehicleId: "v-2",
      driverId: "d-2",
      zone: "城东",
      cargoKg: 1200,
      startAt: at(0, 9, 0),
      endAt: at(0, 17, 30),
      status: "执行中",
      notes: "医药配送，预计17:30返回",
      createdAt: at(0, 8, 30),
      revisionNo: 1,
      sourceId: null
    },
    {
      id: "o-3",
      orderNo: "D-0003",
      vehicleId: "v-1",
      driverId: "d-1",
      zone: "城北",
      cargoKg: 800,
      startAt: at(1, 9, 0),
      endAt: at(1, 11, 0),
      status: "待执行",
      notes: "客户追加货量，修订自 D-0001",
      createdAt: at(0, 8, 40),
      revisionNo: 2,
      sourceId: "o-1"
    },
    {
      id: "o-4",
      orderNo: "D-0004",
      vehicleId: "v-3",
      driverId: "d-3",
      zone: "城南",
      cargoKg: 900,
      startAt: at(0, 22, 0),
      endAt: at(1, 6, 0),
      status: "待执行",
      notes: "冷链夜配，跨日班次连续占用",
      createdAt: at(0, 9, 0),
      revisionNo: 1,
      sourceId: null
    }
  ];
  return { version: STORAGE_VERSION, vehicles, drivers, orders, counter: 5 };
}

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    if (parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.orders)) {
      return seedState();
    }
    return parsed as PersistedState;
  } catch {
    return seedState();
  }
}

export type SubmitResult = { ok: boolean; conflicts: Conflict[] };

export const useDispatchStore = defineStore("dispatch", () => {
  const state = loadState();
  const vehicles = ref<Vehicle[]>(state.vehicles);
  const drivers = ref<Driver[]>(state.drivers);
  const orders = ref<Order[]>(state.orders);
  const counter = ref(state.counter);

  watch(
    [vehicles, drivers, orders, counter],
    () => {
      const payload: PersistedState = {
        version: STORAGE_VERSION,
        vehicles: vehicles.value,
        drivers: drivers.value,
        orders: orders.value,
        counter: counter.value
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    },
    { deep: true, immediate: true }
  );

  const vehicleById = computed(() => new Map(vehicles.value.map((item) => [item.id, item])));
  const driverById = computed(() => new Map(drivers.value.map((item) => [item.id, item])));
  const orderById = computed(() => new Map(orders.value.map((item) => [item.id, item])));

  /** 当前占用：进行中订单（待执行 + 执行中）的车辆/司机时段 */
  const occupancies = computed(() =>
    orders.value
      .filter(isActive)
      .map((order) => ({
        orderNo: order.orderNo,
        status: order.status,
        plate: vehicleById.value.get(order.vehicleId)?.plate ?? "未知车辆",
        driverName: driverById.value.get(order.driverId)?.name ?? "未知司机",
        window: fmtWindow(order.startAt, order.endAt),
        startAt: order.startAt
      }))
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
  );

  /** 每辆车的实时状态：当前占用它的订单 + 下一班 */
  const vehicleBoard = computed(() =>
    vehicles.value.map((vehicle) => {
      const now = Date.now();
      const active = orders.value.filter(
        (order) => order.vehicleId === vehicle.id && isActive(order)
      );
      const current = active.find(
        (order) => Date.parse(order.startAt) <= now && now < Date.parse(order.endAt)
      );
      const upcoming = active
        .filter((order) => Date.parse(order.startAt) > now)
        .sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
      return { vehicle, current, upcoming };
    })
  );

  const idleVehicleCount = computed(
    () => vehicleBoard.value.filter((item) => !item.current).length
  );

  const metrics = computed(() => ({
    vehicleTotal: vehicles.value.length,
    running: orders.value.filter((order) => order.status === "执行中").length,
    idleVehicles: idleVehicleCount.value,
    done: orders.value.filter((order) => order.status === "已完成").length
  }));

  const statusCounts = computed(() =>
    (["待执行", "执行中", "已完成"] as const).map((status) => ({
      status,
      value: orders.value.filter((order) => order.status === status).length
    }))
  );

  const chains = computed(() => groupChains(orders.value));

  function chainOf(order: Order): Order[] {
    for (const chain of chains.value.values()) {
      if (chain.some((item) => item.id === order.id)) return chain;
    }
    return [order];
  }

  function buildOrder(draft: OrderDraft, source: Order | null): Order {
    const window = resolveWindow(draft.date, draft.startTime, draft.endTime);
    const order: Order = {
      id: crypto.randomUUID(),
      orderNo: nextOrderNo(counter.value),
      vehicleId: draft.vehicleId,
      driverId: draft.driverId,
      zone: draft.zone,
      cargoKg: draft.cargoKg,
      startAt: window.startAt,
      endAt: window.endAt,
      status: "待执行",
      notes: draft.notes || "暂无备注",
      createdAt: new Date().toISOString(),
      revisionNo: source ? source.revisionNo + 1 : 1,
      sourceId: source ? source.id : null
    };
    counter.value += 1;
    return order;
  }

  function checkDraft(
    draft: OrderDraft,
    locked?: { vehicleId: string; driverId: string },
    excludeOrderId?: string
  ): SubmitResult {
    const window = resolveWindow(draft.date, draft.startTime, draft.endTime);
    const candidate = {
      vehicleId: locked?.vehicleId ?? draft.vehicleId,
      driverId: locked?.driverId ?? draft.driverId,
      cargoKg: draft.cargoKg,
      startAt: window.startAt,
      endAt: window.endAt
    };
    const conflicts = findConflicts(
      candidate,
      orders.value,
      vehicles.value,
      drivers.value,
      excludeOrderId
    );
    return { ok: conflicts.length === 0, conflicts };
  }

  /** 新建派单 */
  function assign(draft: OrderDraft): SubmitResult {
    const result = checkDraft(draft);
    if (!result.ok) return result;
    orders.value = [buildOrder(draft, null), ...orders.value];
    return { ok: true, conflicts: [] };
  }

  /**
   * 编辑派单：仅待执行/执行中可改；执行中锁定车辆与司机（即使绕过界面也强制）。
   * 已完成订单不可编辑，只能新建修订。
   */
  function update(id: string, draft: OrderDraft): SubmitResult {
    const order = orderById.value.get(id);
    if (!order || order.status === "已完成") {
      return { ok: false, conflicts: [] };
    }
    const locked =
      order.status === "执行中"
        ? { vehicleId: order.vehicleId, driverId: order.driverId }
        : undefined;
    const result = checkDraft(draft, locked, id);
    if (!result.ok) return result;
    const window = resolveWindow(draft.date, draft.startTime, draft.endTime);
    orders.value = orders.value.map((item) =>
      item.id === id
        ? {
            ...item,
            vehicleId: locked?.vehicleId ?? draft.vehicleId,
            driverId: locked?.driverId ?? draft.driverId,
            zone: draft.zone,
            cargoKg: draft.cargoKg,
            startAt: window.startAt,
            endAt: window.endAt,
            notes: draft.notes || item.notes
          }
        : item
    );
    return { ok: true, conflicts: [] };
  }

  /** 已完成订单的修订：新建带来源的单，旧记录保留 */
  function revise(sourceId: string, draft: OrderDraft): SubmitResult {
    const source = orderById.value.get(sourceId);
    if (!source || source.status !== "已完成") {
      return { ok: false, conflicts: [] };
    }
    const result = checkDraft(draft);
    if (!result.ok) return result;
    orders.value = [buildOrder(draft, source), ...orders.value];
    return { ok: true, conflicts: [] };
  }

  function start(id: string) {
    orders.value = orders.value.map((item) =>
      item.id === id && item.status === "待执行" ? { ...item, status: "执行中" } : item
    );
  }

  function complete(id: string) {
    orders.value = orders.value.map((item) =>
      item.id === id && item.status === "执行中" ? { ...item, status: "已完成" } : item
    );
  }

  /** 仅待执行订单可删除；执行中/已完成必须保留 */
  function remove(id: string) {
    const order = orderById.value.get(id);
    if (!order || order.status !== "待执行") return;
    orders.value = orders.value.filter((item) => item.id !== id);
  }

  return {
    vehicles,
    drivers,
    orders,
    vehicleById,
    driverById,
    occupancies,
    vehicleBoard,
    metrics,
    statusCounts,
    chainOf,
    assign,
    update,
    revise,
    start,
    complete,
    remove
  };
});
