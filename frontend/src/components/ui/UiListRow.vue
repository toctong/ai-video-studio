<template>
  <component
    :is="tag"
    class="ui-list-row"
    :class="{ active }"
    v-bind="linkProps"
    @click="onClick"
  >
    <slot name="leading" />
    <span class="title"><slot>{{ title }}</slot></span>
    <span v-if="meta || $slots.meta" class="meta"><slot name="meta">{{ meta }}</slot></span>
    <slot name="trailing" />
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

const props = defineProps<{
  title?: string;
  meta?: string;
  active?: boolean;
  to?: string;
}>();

const emit = defineEmits<{ click: [MouseEvent] }>();

const tag = computed(() => (props.to ? RouterLink : 'button'));
const linkProps = computed(() =>
  props.to ? { to: props.to } : { type: 'button' as const },
);

function onClick(e: MouseEvent) {
  emit('click', e);
}
</script>
