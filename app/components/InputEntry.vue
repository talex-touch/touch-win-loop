<script setup lang="ts">
const name = ref('')

const router = useRouter()
function go() {
  if (name.value)
    router.push(`/hi/${encodeURIComponent(name.value)}`)
}
</script>

<template>
  <div class="space-y-4">
    <input
      id="input"
      v-model="name"
      placeholder="输入一个昵称"
      type="text"
      autocomplete="off"
      class="dense-input max-w-[250px] text-center"
      @keydown.enter="go"
    >
    <div>
      <button
        class="dense-btn"
        :disabled="!name"
        @click="go"
      >
        进入
      </button>
    </div>
  </div>
</template>
