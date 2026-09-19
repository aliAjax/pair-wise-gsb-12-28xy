<script setup lang="ts">
import { computed, ref } from "vue";
import { useDispatchStore } from "./stores/dispatch";
import type { FormMode, Task } from "./types";
import { TASK_STATUSES, ZONES } from "./constants";
import { toTs } from "./lib/time";
import DispatchForm from "./components/DispatchForm.vue";
import TaskList from "./components/TaskList.vue";
import OccupancyBoard from "./components/OccupancyBoard.vue";
import ResourceManager from "./components/ResourceManager.vue";

const project = {
  industry: "物流",
  title: "车辆调度小工具",
  subtitle:
    "派单闭环：每单记录配送时段、货重、区域与车辆；车辆/司机时段重叠或货重超重会被拦截并列出明细；执行中锁定车辆与司机，完成后只能新建带来源的修订，旧记录保留。",
  stack: ["Vue3", "Vite", "TypeScript", "Pinia", "Naive UI"],
  metricLabels: ["任务总数", "执行中", "空闲车辆"]
} as const;

const store = useDispatchStore();

const formMode = ref<FormMode>({ kind: "create" });
function editTask(task: Task) {
  formMode.value = { kind: "edit", taskId: task.id };
}
function reviseTask(task: Task) {
  formMode.value = { kind: "revise", sourceId: task.id };
}
function resetFormMode() {
  formMode.value = { kind: "create" };
}

const zoneFilter = ref("全部区域");
const statusFilter = ref("全部状态");

const filteredTasks = computed(() =>
  store.tasks
    .filter((task) => zoneFilter.value === "全部区域" || task.zone === zoneFilter.value)
    .filter((task) => statusFilter.value === "全部状态" || task.status === statusFilter.value)
    .slice()
    .sort((a, b) => toTs(b.start) - toTs(a.start))
);

const metrics = computed(() => {
  const active = store.tasks.filter((task) => task.status !== "已取消").length;
  const running = store.tasks.filter((task) => task.status === "执行中").length;
  const busyVehicles = new Set(
    store.tasks.filter((task) => task.status === "执行中").map((task) => task.vehicleId)
  );
  const idleVehicles = store.vehicles.filter((vehicle) => !busyVehicles.has(vehicle.id)).length;
  return [active, running, idleVehicles];
});

const chartRows = computed(() =>
  TASK_STATUSES.map((status) => ({
    status,
    value: store.tasks.filter((task) => task.status === status).length
  }))
);
const maxChart = computed(() => Math.max(1, ...chartRows.value.map((row) => row.value)));
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">{{ project.industry }}行业前端派单闭环</p>
          <h1>{{ project.title }}</h1>
          <p class="subtitle">{{ project.subtitle }}</p>
        </div>
        <div class="stack">
          <span v-for="item in project.stack" :key="item" class="tag">{{ item }}</span>
        </div>
      </header>

      <section class="metrics">
        <article v-for="(label, index) in project.metricLabels" :key="label" class="metric">
          <span>{{ label }}</span>
          <strong>{{ metrics[index] }}</strong>
        </article>
      </section>

      <section class="workspace">
        <DispatchForm :mode="formMode" @close="resetFormMode" />

        <section class="list-panel">
          <div class="toolbar">
            <h2>任务列表</h2>
            <div class="filters">
              <select v-model="statusFilter">
                <option>全部状态</option>
                <option v-for="status in TASK_STATUSES" :key="status">{{ status }}</option>
              </select>
              <select v-model="zoneFilter">
                <option>全部区域</option>
                <option v-for="zone in ZONES" :key="zone">{{ zone }}</option>
              </select>
            </div>
          </div>

          <TaskList :tasks="filteredTasks" @edit="editTask" @revise="reviseTask" />

          <div class="mini-chart">
            <div v-for="row in chartRows" :key="row.status" class="bar">
              <span>{{ row.status }}</span>
              <div class="bar-track">
                <div class="bar-fill" :style="{ width: `${(row.value / maxChart) * 100}%` }" />
              </div>
              <strong>{{ row.value }}</strong>
            </div>
          </div>
        </section>
      </section>

      <section class="bottom-grid">
        <OccupancyBoard />
        <ResourceManager />
      </section>
    </div>
  </main>
</template>
