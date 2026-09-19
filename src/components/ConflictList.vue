<script setup lang="ts">
import { computed } from "vue";
import type { Conflict } from "../lib/conflicts";
import { useDispatchStore } from "../stores/dispatch";
import { formatDateTime } from "../lib/time";

const props = defineProps<{ conflicts: Conflict[] }>();
const store = useDispatchStore();

const lines = computed(() =>
  props.conflicts.map((conflict) => {
    if (conflict.kind === "vehicle") {
      const plate = store.vehicleById(conflict.task.vehicleId)?.plate ?? "未知车辆";
      const window = `${formatDateTime(conflict.overlapStart)} ~ ${formatDateTime(conflict.overlapEnd)}`;
      return `车辆冲突：${plate} 已被任务「${conflict.task.title}」（${conflict.task.status}）占用，重叠时段 ${window}`;
    }
    if (conflict.kind === "driver") {
      const name = store.driverById(conflict.task.driverId)?.name ?? "未知司机";
      const window = `${formatDateTime(conflict.overlapStart)} ~ ${formatDateTime(conflict.overlapEnd)}`;
      return `司机冲突：${name} 在任务「${conflict.task.title}」（${conflict.task.status}）出勤，重叠时段 ${window}`;
    }
    return `超重：货重 ${conflict.weightKg} kg 超出车辆 ${conflict.vehicle.plate} 载重 ${conflict.vehicle.capacityKg} kg，超重 ${conflict.excessKg} kg`;
  })
);
</script>

<template>
  <ul class="conflict-list">
    <li v-for="(line, index) in lines" :key="index">{{ line }}</li>
  </ul>
</template>
