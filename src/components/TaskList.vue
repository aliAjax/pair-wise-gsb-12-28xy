<script setup lang="ts">
import { useDispatchStore } from "../stores/dispatch";
import type { Task, TaskStatus } from "../types";
import { formatWindow, isCrossDay } from "../lib/time";

defineProps<{ tasks: Task[] }>();
const emit = defineEmits<{
  (e: "edit", task: Task): void;
  (e: "revise", task: Task): void;
}>();
const store = useDispatchStore();

const STATUS_CLASS: Record<TaskStatus, string> = {
  待执行: "is-pending",
  执行中: "is-running",
  已完成: "is-done",
  已取消: "is-cancelled"
};

function plate(task: Task) {
  return store.vehicleById(task.vehicleId)?.plate ?? "未知车辆";
}
function capacity(task: Task) {
  return store.vehicleById(task.vehicleId)?.capacityKg ?? 0;
}
function driverName(task: Task) {
  return store.driverById(task.driverId)?.name ?? "未知司机";
}
/** 车辆载重后续可能被调低，实时标出超重差额 */
function excessKg(task: Task) {
  return Math.max(0, task.weightKg - capacity(task));
}
function sourceOf(task: Task) {
  return task.sourceId ? store.taskById(task.sourceId) : undefined;
}
</script>

<template>
  <div class="record-grid">
    <div v-if="tasks.length === 0" class="empty">暂无匹配数据</div>
    <article v-for="task in tasks" :key="task.id" class="record">
      <div class="record-head">
        <p class="record-title">
          {{ task.title }}
          <span v-if="isCrossDay(task.start, task.end)" class="badge cross">跨日</span>
          <span v-if="task.revision > 0" class="badge rev">修订 #{{ task.revision }}</span>
        </p>
        <span class="status" :class="STATUS_CLASS[task.status]">{{ task.status }}</span>
      </div>

      <div class="details">
        <span>车辆: {{ plate(task) }}（载重 {{ capacity(task) }} kg）</span>
        <span>司机: {{ driverName(task) }}</span>
        <span>配送区域: {{ task.zone }}</span>
        <span>
          货重: {{ task.weightKg }} kg
          <template v-if="excessKg(task) > 0">
            <em class="overweight">（超重 {{ excessKg(task) }} kg）</em>
          </template>
        </span>
        <span class="span-2">配送时段: {{ formatWindow(task.start, task.end) }}</span>
      </div>

      <div v-if="sourceOf(task) || store.revisionsOf(task.id).length" class="chain">
        <span v-if="sourceOf(task)">
          来源：「{{ sourceOf(task)!.title }}」 · {{ plate(sourceOf(task)!) }} ·
          {{ sourceOf(task)!.status }}（修订 #{{ sourceOf(task)!.revision }}）
        </span>
        <span v-for="child in store.revisionsOf(task.id)" :key="child.id">
          后续修订：「{{ child.title }}」 · 修订 #{{ child.revision }} · {{ child.status }}
        </span>
      </div>

      <p class="note">{{ task.notes || "暂无备注" }}</p>

      <div class="actions">
        <template v-if="task.status === '待执行'">
          <button type="button" @click="store.startTask(task.id)">开始执行</button>
          <button type="button" class="secondary" @click="emit('edit', task)">编辑</button>
          <button type="button" class="danger" @click="store.cancelTask(task.id)">取消任务</button>
        </template>
        <template v-else-if="task.status === '执行中'">
          <button type="button" @click="store.completeTask(task.id)">完成任务</button>
          <button type="button" class="secondary" @click="emit('edit', task)">
            编辑（车/司机锁定）
          </button>
        </template>
        <template v-else-if="task.status === '已完成'">
          <button type="button" class="secondary" @click="emit('revise', task)">新建修订</button>
        </template>
      </div>
    </article>
  </div>
</template>
