<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useDispatchStore } from "../stores/dispatch";
import { findConflicts } from "../lib/conflicts";
import { toLocalInput } from "../lib/time";
import type { FormMode, Task, TaskDraft } from "../types";
import { ZONES } from "../constants";
import ConflictList from "./ConflictList.vue";

const props = defineProps<{ mode: FormMode }>();
const emit = defineEmits<{ (e: "close"): void }>();
const store = useDispatchStore();

const HOUR = 3600_000;

function blankDraft() {
  const start = new Date(Math.ceil(Date.now() / HOUR) * HOUR + HOUR);
  return {
    title: "",
    vehicleId: "",
    driverId: "",
    zone: "",
    weightKg: "" as number | "",
    startLocal: toLocalInput(start.toISOString()),
    endLocal: toLocalInput(new Date(start.getTime() + 2 * HOUR).toISOString()),
    notes: ""
  };
}

const draft = reactive(blankDraft());
const submitAttempted = ref(false);
const blockedMessage = ref("");

const editingTask = computed(() =>
  props.mode.kind === "edit" ? store.taskById(props.mode.taskId) : undefined
);
const sourceTask = computed(() =>
  props.mode.kind === "revise" ? store.taskById(props.mode.sourceId) : undefined
);
/** 执行中的任务不能改车或司机 */
const lockAssignment = computed(() => editingTask.value?.status === "执行中");

function fillFrom(task: Task) {
  draft.title = task.title;
  draft.vehicleId = task.vehicleId;
  draft.driverId = task.driverId;
  draft.zone = task.zone;
  draft.weightKg = task.weightKg;
  draft.startLocal = toLocalInput(task.start);
  draft.endLocal = toLocalInput(task.end);
  draft.notes = task.notes;
}

watch(
  () => props.mode,
  (mode) => {
    submitAttempted.value = false;
    blockedMessage.value = "";
    if (mode.kind === "edit") {
      const task = store.taskById(mode.taskId);
      if (task) fillFrom(task);
    } else if (mode.kind === "revise") {
      const source = store.taskById(mode.sourceId);
      if (source) fillFrom(source);
    } else {
      Object.assign(draft, blankDraft());
    }
  },
  { immediate: true }
);

function safeIso(local: string): string {
  if (!local) return "";
  const ts = new Date(local).getTime();
  return Number.isFinite(ts) ? new Date(ts).toISOString() : "";
}

const checkDraft = computed<TaskDraft>(() => ({
  title: draft.title,
  vehicleId: draft.vehicleId,
  driverId: draft.driverId,
  zone: draft.zone,
  weightKg: Number(draft.weightKg) || 0,
  start: safeIso(draft.startLocal),
  end: safeIso(draft.endLocal),
  notes: draft.notes
}));

const validationErrors = computed(() => store.validateDraft(checkDraft.value));

/** 实时冲突：编辑时排除任务自身；修订是新单，来源已完成不占资源 */
const liveConflicts = computed(() =>
  findConflicts(
    checkDraft.value,
    store.tasks,
    store.vehicles,
    props.mode.kind === "edit" ? props.mode.taskId : undefined
  )
);

const formTitle = computed(() => {
  if (props.mode.kind === "edit") {
    return lockAssignment.value ? "编辑任务（执行中 · 车辆司机已锁定）" : "编辑任务";
  }
  if (props.mode.kind === "revise") return "新建修订";
  return "新增配送任务";
});

const submitText = computed(() => {
  if (props.mode.kind === "edit") return "保存修改";
  if (props.mode.kind === "revise") return "提交修订（生成新单）";
  return "分配任务";
});

function vehiclePlate(id: string) {
  return store.vehicleById(id)?.plate ?? "未知车辆";
}

function submit() {
  submitAttempted.value = true;
  blockedMessage.value = "";
  if (validationErrors.value.length) return;
  if (liveConflicts.value.length) return; // 冲突明细已在下方列出

  const result =
    props.mode.kind === "edit"
      ? store.updateTask(props.mode.taskId, checkDraft.value)
      : store.addTask(checkDraft.value, props.mode.kind === "revise" ? sourceTask.value : undefined);

  if (!result.ok) {
    blockedMessage.value = result.message ?? "保存失败，请检查冲突明细";
    return;
  }
  emit("close");
}
</script>

<template>
  <form class="panel" @submit.prevent="submit">
    <h2>{{ formTitle }}</h2>

    <p v-if="mode.kind === 'revise' && sourceTask" class="banner">
      来源：「{{ sourceTask.title }}」 · {{ vehiclePlate(sourceTask.vehicleId) }} · 修订
      #{{ sourceTask.revision }} → 新单修订 #{{ store.nextRevisionOf(sourceTask) }}；旧记录保留，不可再改。
    </p>
    <p v-if="lockAssignment" class="banner warn">
      任务执行中，车辆与司机已锁定，只能调整区域、货重、时段与备注。
    </p>

    <div class="form-grid">
      <label>
        任务名称
        <input v-model="draft.title" type="text" placeholder="如：商超补货" />
      </label>
      <label>
        车辆
        <select v-model="draft.vehicleId" :disabled="lockAssignment">
          <option value="">请选择</option>
          <option v-for="vehicle in store.vehicles" :key="vehicle.id" :value="vehicle.id">
            {{ vehicle.plate }} · 载重 {{ vehicle.capacityKg }} kg
          </option>
        </select>
      </label>
      <label>
        司机
        <select v-model="draft.driverId" :disabled="lockAssignment">
          <option value="">请选择</option>
          <option v-for="driver in store.drivers" :key="driver.id" :value="driver.id">
            {{ driver.name }}
          </option>
        </select>
      </label>
      <label>
        配送区域
        <select v-model="draft.zone">
          <option value="">请选择</option>
          <option v-for="zone in ZONES" :key="zone" :value="zone">{{ zone }}</option>
        </select>
      </label>
      <label>
        货重（kg）
        <input v-model.number="draft.weightKg" type="number" min="0" step="1" placeholder="0" />
      </label>
      <label>
        时段开始
        <input v-model="draft.startLocal" type="datetime-local" />
      </label>
      <label>
        时段结束
        <input v-model="draft.endLocal" type="datetime-local" />
      </label>
      <p class="hint">跨日班次按连续占用处理：结束时间选择次日即可，车辆与司机全程占用。</p>
      <label>
        备注
        <textarea v-model="draft.notes" placeholder="填写处理说明或现场备注" />
      </label>

      <div v-if="submitAttempted && validationErrors.length" class="conflict-panel">
        <strong>请先完善表单：</strong>
        <ul class="conflict-list">
          <li v-for="error in validationErrors" :key="error">{{ error }}</li>
        </ul>
      </div>

      <div v-if="liveConflicts.length" class="conflict-panel">
        <strong>当前无法分派，存在 {{ liveConflicts.length }} 项冲突：</strong>
        <ConflictList :conflicts="liveConflicts" />
      </div>

      <div v-if="blockedMessage" class="conflict-panel">
        <strong>{{ blockedMessage }}</strong>
      </div>

      <div class="actions">
        <button type="submit">{{ submitText }}</button>
        <button v-if="mode.kind !== 'create'" type="button" class="secondary" @click="emit('close')">
          取消
        </button>
      </div>
    </div>
  </form>
</template>
