<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { storeToRefs } from "pinia";
import { useDispatchStore } from "./store";
import {
  fmtHours,
  fmtWindow,
  toLocalDate,
  toLocalTime,
  type Conflict,
  type Order,
  type OrderDraft,
  type OrderStatus
} from "./domain";

const project = {
  industry: "物流",
  title: "车辆调度派单闭环",
  subtitle:
    "每单记录配送时段、货重、区域与车辆；同车或同司机时段重叠、货重超载自动拦截，跨日班次按连续占用处理；执行中锁定车辆司机，完成后只能新建带来源的修订，刷新后任务、占用与修订链不丢失。",
  stack: ["Vue3", "Vite", "TypeScript", "Pinia", "Naive UI"]
} as const;

const ZONES = ["城北", "城东", "城南"] as const;
const filters = ["全部区域", ...ZONES];

const store = useDispatchStore();
const { orders, vehicles, drivers, occupancies, vehicleBoard, metrics, statusCounts } =
  storeToRefs(store);

const filter = ref<string>(filters[0]);

type FormMode = "create" | "edit" | "revise";
const mode = ref<FormMode>("create");
const editingId = ref<string | null>(null);
const reviseSourceId = ref<string | null>(null);
const conflicts = ref<Conflict[]>([]);

function blankDraft(): OrderDraft {
  return {
    vehicleId: "",
    driverId: "",
    zone: ZONES[0],
    cargoKg: 0,
    date: toLocalDate(new Date().toISOString()),
    startTime: "",
    endTime: "",
    notes: ""
  };
}

const form = reactive<OrderDraft>(blankDraft());

const editingOrder = computed(() =>
  mode.value === "edit" ? orders.value.find((order) => order.id === editingId.value) ?? null : null
);
const reviseSource = computed(() =>
  mode.value === "revise"
    ? orders.value.find((order) => order.id === reviseSourceId.value) ?? null
    : null
);
/** 执行中任务锁定车辆与司机 */
const resourcesLocked = computed(() => editingOrder.value?.status === "执行中");
/** 结束时间不晚于开始时间 => 跨日班次，连续占用到次日 */
const crossesMidnight = computed(
  () => Boolean(form.startTime && form.endTime && form.endTime <= form.startTime)
);

const formTitle = computed(() => {
  if (mode.value === "edit") return `编辑派单 ${editingOrder.value?.orderNo ?? ""}`;
  if (mode.value === "revise") return `新建修订（来源 ${reviseSource.value?.orderNo ?? ""}）`;
  return "新增派单";
});
const submitText = computed(() =>
  mode.value === "edit" ? "保存修改" : mode.value === "revise" ? "提交修订" : "分配任务"
);

const metricCards = computed(() => [
  { label: "车辆总数", value: metrics.value.vehicleTotal },
  { label: "执行中", value: metrics.value.running },
  { label: "空闲车辆", value: metrics.value.idleVehicles },
  { label: "已完成", value: metrics.value.done }
]);

const filteredOrders = computed(() => {
  const list =
    filter.value === "全部区域"
      ? orders.value
      : orders.value.filter((order) => order.zone === filter.value);
  return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
});

const maxChart = computed(() => Math.max(1, ...statusCounts.value.map((row) => row.value)));

function plateOf(order: Order) {
  return store.vehicleById.get(order.vehicleId)?.plate ?? "未知车辆";
}
function capacityOf(order: Order) {
  return store.vehicleById.get(order.vehicleId)?.capacityKg ?? 0;
}
function driverNameOf(order: Order) {
  return store.driverById.get(order.driverId)?.name ?? "未知司机";
}
function sourceNoOf(order: Order) {
  if (!order.sourceId) return null;
  return orders.value.find((item) => item.id === order.sourceId)?.orderNo ?? null;
}
function statusClass(status: OrderStatus) {
  return status === "执行中" ? "running" : status === "已完成" ? "done" : "pending";
}

function conflictText(conflict: Conflict): string {
  if (conflict.kind === "vehicle") {
    return `冲突车辆 ${conflict.plate}：与派单 ${conflict.orderNo} 时段重叠 ${fmtWindow(conflict.overlapStart, conflict.overlapEnd)}（重叠 ${fmtHours(conflict.overlapStart, conflict.overlapEnd)}）`;
  }
  if (conflict.kind === "driver") {
    return `冲突司机 ${conflict.driverName}：与派单 ${conflict.orderNo} 时段重叠 ${fmtWindow(conflict.overlapStart, conflict.overlapEnd)}（重叠 ${fmtHours(conflict.overlapStart, conflict.overlapEnd)}）`;
  }
  return `超重：货重 ${conflict.cargoKg} kg 超过车辆 ${conflict.plate} 载重 ${conflict.capacityKg} kg，超重差额 ${conflict.excessKg} kg`;
}

function fillFrom(order: Order) {
  form.vehicleId = order.vehicleId;
  form.driverId = order.driverId;
  form.zone = order.zone;
  form.cargoKg = order.cargoKg;
  form.date = toLocalDate(order.startAt);
  form.startTime = toLocalTime(order.startAt);
  form.endTime = toLocalTime(order.endAt);
  form.notes = order.notes;
}

function resetForm() {
  Object.assign(form, blankDraft());
  mode.value = "create";
  editingId.value = null;
  reviseSourceId.value = null;
  conflicts.value = [];
}

function submit() {
  const draft = { ...form };
  const result =
    mode.value === "edit" && editingId.value
      ? store.update(editingId.value, draft)
      : mode.value === "revise" && reviseSourceId.value
        ? store.revise(reviseSourceId.value, draft)
        : store.assign(draft);
  if (result.ok) {
    resetForm();
  } else {
    conflicts.value = result.conflicts;
  }
}

function startEdit(order: Order) {
  mode.value = "edit";
  editingId.value = order.id;
  reviseSourceId.value = null;
  fillFrom(order);
  conflicts.value = [];
}

function startRevise(order: Order) {
  mode.value = "revise";
  reviseSourceId.value = order.id;
  editingId.value = null;
  fillFrom(order);
  form.notes = `修订自 ${order.orderNo}：`;
  conflicts.value = [];
}
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">{{ project.industry }}行业前端最小闭环</p>
          <h1>{{ project.title }}</h1>
          <p class="subtitle">{{ project.subtitle }}</p>
        </div>
        <div class="stack">
          <span v-for="item in project.stack" :key="item" class="tag">{{ item }}</span>
        </div>
      </header>

      <section class="metrics">
        <article v-for="card in metricCards" :key="card.label" class="metric">
          <span>{{ card.label }}</span>
          <strong>{{ card.value }}</strong>
        </article>
      </section>

      <section class="workspace">
        <form class="panel" @submit.prevent="submit">
          <h2>{{ formTitle }}</h2>
          <p v-if="mode === 'edit'" class="mode-banner">
            正在编辑 {{ editingOrder?.orderNo }}（{{ editingOrder?.status }}）
            <button type="button" class="link" @click="resetForm">取消</button>
          </p>
          <p v-else-if="mode === 'revise'" class="mode-banner">
            来源单 {{ reviseSource?.orderNo }} 已完成，提交后将新建派单并保留原记录
            <button type="button" class="link" @click="resetForm">取消</button>
          </p>

          <div class="form-grid">
            <label>
              车牌号
              <select v-model="form.vehicleId" :disabled="resourcesLocked" required>
                <option value="" disabled>请选择车辆</option>
                <option v-for="vehicle in vehicles" :key="vehicle.id" :value="vehicle.id">
                  {{ vehicle.plate }}（载重 {{ vehicle.capacityKg }} kg）
                </option>
              </select>
            </label>
            <label>
              司机
              <select v-model="form.driverId" :disabled="resourcesLocked" required>
                <option value="" disabled>请选择司机</option>
                <option v-for="driver in drivers" :key="driver.id" :value="driver.id">
                  {{ driver.name }}
                </option>
              </select>
            </label>
            <p v-if="resourcesLocked" class="hint">执行中任务不可更换车辆或司机</p>
            <label>
              配送区域
              <select v-model="form.zone" required>
                <option v-for="zone in ZONES" :key="zone">{{ zone }}</option>
              </select>
            </label>
            <label>
              货重（kg）
              <input v-model.number="form.cargoKg" type="number" min="1" required />
            </label>
            <label>
              配送日期
              <input v-model="form.date" type="date" required />
            </label>
            <div class="time-grid">
              <label>
                开始时间
                <input v-model="form.startTime" type="time" required />
              </label>
              <label>
                结束时间
                <input v-model="form.endTime" type="time" required />
              </label>
            </div>
            <p v-if="crossesMidnight" class="hint">
              跨日班次：结束时间按次日处理，车辆与司机连续占用
            </p>
            <label>
              备注
              <textarea v-model="form.notes" placeholder="填写货物、客户或现场说明" />
            </label>
            <button type="submit">{{ submitText }}</button>
          </div>

          <div v-if="conflicts.length" class="conflict-panel">
            <strong>派单冲突（{{ conflicts.length }} 项），请调整后重新提交：</strong>
            <ul>
              <li v-for="(conflict, index) in conflicts" :key="index">
                {{ conflictText(conflict) }}
              </li>
            </ul>
          </div>
        </form>

        <section class="list-panel">
          <div class="toolbar">
            <h2>派单列表</h2>
            <select v-model="filter">
              <option v-for="item in filters" :key="item">{{ item }}</option>
            </select>
          </div>

          <div class="vehicle-board">
            <article v-for="item in vehicleBoard" :key="item.vehicle.id" class="vehicle-card">
              <div class="vehicle-head">
                <strong>{{ item.vehicle.plate }}</strong>
                <span class="pill" :class="item.current ? 'busy' : 'idle'">
                  {{ item.current ? "占用中" : "空闲" }}
                </span>
              </div>
              <p>载重 {{ item.vehicle.capacityKg }} kg</p>
              <p v-if="item.current">
                当前：{{ fmtWindow(item.current.startAt, item.current.endAt) }}（{{
                  item.current.orderNo
                }}）
              </p>
              <p v-else-if="item.upcoming">
                下一班：{{ fmtWindow(item.upcoming.startAt, item.upcoming.endAt) }}
              </p>
              <p v-else>暂无排班</p>
            </article>
          </div>

          <details class="occupancy" open>
            <summary>当前占用（{{ occupancies.length }}）</summary>
            <ul v-if="occupancies.length">
              <li v-for="occ in occupancies" :key="occ.orderNo">
                {{ occ.plate }} · {{ occ.driverName }} · {{ occ.window }}（{{ occ.status }}）
              </li>
            </ul>
            <p v-else class="empty">当前无占用</p>
          </details>

          <div class="record-grid">
            <div v-if="filteredOrders.length === 0" class="empty">暂无匹配数据</div>
            <article v-for="order in filteredOrders" :key="order.id" class="record">
              <div class="record-head">
                <p class="record-title">
                  {{ order.orderNo }}
                  <span v-if="order.revisionNo > 1" class="rev-tag">修订 #{{ order.revisionNo }}</span>
                </p>
                <span class="status" :class="statusClass(order.status)">{{ order.status }}</span>
              </div>
              <div class="details">
                <span>车辆: {{ plateOf(order) }}（载重 {{ capacityOf(order) }} kg）</span>
                <span>司机: {{ driverNameOf(order) }}</span>
                <span>区域: {{ order.zone }}</span>
                <span>货重: {{ order.cargoKg }} kg</span>
                <span>时段: {{ fmtWindow(order.startAt, order.endAt) }}</span>
                <span>时长: {{ fmtHours(order.startAt, order.endAt) }}</span>
                <span v-if="sourceNoOf(order)">来源: {{ sourceNoOf(order) }}</span>
              </div>
              <p v-if="store.chainOf(order).length > 1" class="chain">
                修订链：
                <template v-for="(item, index) in store.chainOf(order)" :key="item.id">
                  <span :class="{ current: item.id === order.id }">{{ item.orderNo }}</span>
                  <span v-if="index < store.chainOf(order).length - 1"> → </span>
                </template>
              </p>
              <p class="note">{{ order.notes }}</p>
              <div class="actions">
                <button v-if="order.status === '待执行'" type="button" @click="store.start(order.id)">
                  开始执行
                </button>
                <button v-if="order.status === '执行中'" type="button" @click="store.complete(order.id)">
                  完成
                </button>
                <button
                  v-if="order.status !== '已完成'"
                  class="secondary"
                  type="button"
                  @click="startEdit(order)"
                >
                  编辑
                </button>
                <button
                  v-if="order.status === '已完成'"
                  class="secondary"
                  type="button"
                  @click="startRevise(order)"
                >
                  新建修订
                </button>
                <button
                  v-if="order.status === '待执行'"
                  class="danger"
                  type="button"
                  @click="store.remove(order.id)"
                >
                  删除
                </button>
              </div>
            </article>
          </div>

          <div class="mini-chart">
            <div v-for="row in statusCounts" :key="row.status" class="bar">
              <span>{{ row.status }}</span>
              <div class="bar-track">
                <div class="bar-fill" :style="{ width: `${(row.value / maxChart) * 100}%` }" />
              </div>
              <strong>{{ row.value }}</strong>
            </div>
          </div>
        </section>
      </section>
    </div>
  </main>
</template>
