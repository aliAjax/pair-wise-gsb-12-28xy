<script setup lang="ts">
import { ref } from "vue";
import { useDispatchStore } from "../stores/dispatch";

const store = useDispatchStore();

const plate = ref("");
const capacityKg = ref<number | "">("");
const vehicleError = ref("");

const driverName = ref("");
const driverError = ref("");

function submitVehicle() {
  const result = store.addVehicle(plate.value, Number(capacityKg.value) || 0);
  vehicleError.value = result.ok ? "" : result.message ?? "保存失败";
  if (result.ok) {
    plate.value = "";
    capacityKg.value = "";
  }
}

function submitDriver() {
  const result = store.addDriver(driverName.value);
  driverError.value = result.ok ? "" : result.message ?? "保存失败";
  if (result.ok) driverName.value = "";
}
</script>

<template>
  <section class="panel">
    <h2>车辆与司机</h2>
    <div class="resource-grid">
      <div>
        <h3>车辆</h3>
        <ul class="resource-list">
          <li v-for="vehicle in store.vehicles" :key="vehicle.id">
            <strong>{{ vehicle.plate }}</strong>
            <span class="tag">载重 {{ vehicle.capacityKg }} kg</span>
          </li>
        </ul>
        <form class="inline-form" @submit.prevent="submitVehicle">
          <input v-model="plate" type="text" placeholder="车牌号" />
          <input v-model.number="capacityKg" type="number" min="0" step="1" placeholder="载重 kg" />
          <button type="submit">添加车辆</button>
        </form>
        <p v-if="vehicleError" class="error-text">{{ vehicleError }}</p>
      </div>
      <div>
        <h3>司机</h3>
        <ul class="resource-list">
          <li v-for="driver in store.drivers" :key="driver.id">
            <strong>{{ driver.name }}</strong>
          </li>
        </ul>
        <form class="inline-form" @submit.prevent="submitDriver">
          <input v-model="driverName" type="text" placeholder="司机姓名" />
          <button type="submit">添加司机</button>
        </form>
        <p v-if="driverError" class="error-text">{{ driverError }}</p>
      </div>
    </div>
  </section>
</template>
