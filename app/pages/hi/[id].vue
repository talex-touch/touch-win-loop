<script setup lang="ts">
const route = useRoute<'hi-id'>()
const user = useUserStore()
const name = route.params.id

watchEffect(() => {
  user.setNewName(route.params.id as string)
})

definePageMeta({
  layout: 'home',
})
</script>

<template>
  <SectionCard>
    <div class="text-center space-y-4">
      <div i-twemoji:waving-hand class="text-4xl inline-block animate-shake-x animate-duration-5000" />
      <div>
        <h3 class="m-0 text-2xl font-semibold">
          Hi
        </h3>
        <p class="m-0 mt-2 text-lg wl-text-muted">
          {{ name }}!
        </p>
      </div>

      <template v-if="user.otherNames.length">
        <div class="text-sm">
          <span class="opacity-60">也可以试试这些名字：</span>
          <ul class="list-none m-0 mt-3 p-0 space-y-2">
            <li v-for="otherName in user.otherNames" :key="otherName">
              <router-link :to="`/hi/${otherName}`" replace class="text-blue-700 hover:underline">
                {{ otherName }}
              </router-link>
            </li>
          </ul>
        </div>
      </template>

      <Counter />

      <div>
        <NuxtLink
          class="dense-btn"
          to="/"
        >
          返回首页
        </NuxtLink>
      </div>
    </div>
  </SectionCard>
</template>
