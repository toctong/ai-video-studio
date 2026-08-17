<template>
  <div class="ui-toolbar" role="toolbar">
    <slot />
    <span v-if="$slots.end" class="grow" aria-hidden="true" />
    <slot name="end" />
  </div>
</template>
