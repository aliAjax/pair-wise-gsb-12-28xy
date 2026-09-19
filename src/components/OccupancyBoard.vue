<script setup lang="ts">
import { computed } from "vue";
import { useDispatchStore } from "../stores/dispatch";
import { formatWindow, isCrossDay, toTs } from "../lib/time";

const store = useDispatchStore();

/** 每辆车的占用窗口（待执行 + 执行中），跨日班次按连续区间展示 */
const rows = computed(() =>
  store.vehicles.map((vehicle) => {
    const windows = store.occupyingTasks
      .filter((task) => task.vehicleId === vehicle.id)
      .sort((a, b) => toTs(a.start) - toTs(b.start));
    return { vehicle, windows, running: windows.some((task) => task.status === "执行中") };
  })
);

function driverName(id: string) {
  return store.driverById(id)?.name ?? "未知司机";
}
</script>

<template>
  <section class="panel">
    <h2>车辆占用看板</h2>
    <p class="hint">同一车辆或司机时段重叠即冲突；跨日班次按连续占用处理。数据随任务自动更新并持久化。</p>
    <div class="board">
      <div v-for="row in rows" :key="row.vehicle.id" class="board-row">
        <div class="board-head">
          <strong>{{ row.vehicle.plate }}</strong>
          <span class="tag">载重 {{ row.vehicle.capacityKg }} kg</span>
          <span class="status" :class="row.running ? 'is-running' : 'is-idle'">
            {{ row.running ? "执行中" : "空闲" }}
          </span>
        </div>
        <ul v-if="row.windows.length" class="window-list">
          <li v-for="task in row.windows" :key="task.id">
            <span class="window-time">
              {{ formatWindow(task.start, task.end) }}
              <span v-if="isCrossDay(task.start, task.end)" class="badge cross">跨日</span>
            </span>
            <span>{{ driverName(task.driverId) }} · 「{{ task.title }}」 · {{ task.status }}</span>
          </li>
        </ul>
        <p v-else class="hint">当前无占用</p>
      </div>
    </div>
  </section>
</template>
