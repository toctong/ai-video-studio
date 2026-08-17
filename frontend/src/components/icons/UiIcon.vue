<script setup lang="ts">
/**
 * Lucide 风格线标（本地 SVG，不依赖额外 npm 包）
 * 用法：<UiIcon name="home" :size="20" />
 */
import { computed } from 'vue';
import type { IconName } from './types';

const props = withDefaults(
  defineProps<{
    name: IconName;
    size?: number | string;
    strokeWidth?: number | string;
  }>(),
  { size: 20, strokeWidth: 1.75 },
);

const box = computed(() => Number(props.size) || 20);
</script>

<template>
  <svg
    class="ui-icon"
    xmlns="http://www.w3.org/2000/svg"
    :width="box"
    :height="box"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="name === 'home'">
      <path
        d="M4 9.916a2 2 0 0 1 .8-1.6l6-4.5a2 2 0 0 1 2.4 0l6 4.5a2 2 0 0 1 .8 1.6v7.668a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9.916Z"
      />
      <path d="M12 16.422V12.6" />
    </template>
    <template v-else-if="name === 'folder'">
      <path
        fill="currentColor"
        stroke="none"
        d="M9.497 4a3 3 0 0 1 1.804.603l1.01.76c.227.17.498.273.78.296L13.213 5.664H17.5a3 3 0 0 1 3 3V17l-.004.154a3 3 0 0 1-2.842 2.842L17.5 20h-11l-.154-.004A3 3 0 0 1 3.5 17V7a3 3 0 0 1 3-3h2.997ZM6.5 5.5A1.5 1.5 0 0 0 5 7v10a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 17V8.664a1.5 1.5 0 0 0-1.5-1.5h-4.287a3 3 0 0 1-1.804-.602l-1.01-.76a1.501 1.501 0 0 0-.902-.302H6.5Zm8.375 4.25a.75.75 0 0 1 0 1.5h-5.75a.75.75 0 0 1 0-1.5h5.75Z"
      />
    </template>
    <template v-else-if="name === 'sparkles'">
      <path
        d="M11.017 2.814a1 1 0 0 1 1.966 0l1.178 4.332a1 1 0 0 0 .821.706l4.45.675a1 1 0 0 1 .588 1.71l-3.298 3.045a1 1 0 0 0-.302.925l.91 4.385a1 1 0 0 1-1.464 1.06l-3.9-2.202a1 1 0 0 0-.988 0l-3.9 2.202a1 1 0 0 1-1.464-1.06l.91-4.385a1 1 0 0 0-.302-.925L2.98 10.237a1 1 0 0 1 .588-1.71l4.45-.675a1 1 0 0 0 .821-.706z"
      />
    </template>
    <!-- 生成菜单：四角星 + 右上角加号（参考稿） -->
    <template v-else-if="name === 'sparkle-plus'">
      <path
        d="M9.6 3.35c.42-1.15 2.18-1.15 2.6 0l1.35 3.7c.16.44.5.78.94.94l3.7 1.35c1.15.42 1.15 2.18 0 2.6l-3.7 1.35a1.45 1.45 0 0 0-.94.94l-1.35 3.7c-.42 1.15-2.18 1.15-2.6 0l-1.35-3.7a1.45 1.45 0 0 0-.94-.94L3.61 11.94c-1.15-.42-1.15-2.18 0-2.6l3.7-1.35c.44-.16.78-.5.94-.94z"
      />
      <path d="M18.35 2.85v3.9" />
      <path d="M16.4 4.8h3.9" />
    </template>
    <template v-else-if="name === 'bell'">
      <path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
    </template>
    <template v-else-if="name === 'gift'">
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13" />
      <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
    </template>
    <template v-else-if="name === 'zap'">
      <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
    </template>
    <template v-else-if="name === 'gem'">
      <path d="M6 3h12l4 6-10 13L2 9z" />
      <path d="M11 3 8 9l4 13 4-13-3-6" />
      <path d="M2 9h20" />
    </template>
    <template v-else-if="name === 'user'">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </template>
    <template v-else-if="name === 'settings'">
      <path
        d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
      />
      <circle cx="12" cy="12" r="3" />
    </template>
    <template v-else-if="name === 'moon'">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </template>
    <template v-else-if="name === 'sun'">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </template>
    <template v-else-if="name === 'log-out'">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </template>
    <template v-else-if="name === 'plus'">
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </template>
    <template v-else-if="name === 'search'">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </template>
    <template v-else-if="name === 'chevron-down'">
      <path d="m6 9 6 6 6-6" />
    </template>
    <template v-else-if="name === 'arrow-up'">
      <path d="m5 12 7-7 7 7" />
      <path d="M12 19V5" />
    </template>
    <template v-else-if="name === 'upload'">
      <path d="M12 3v12" />
      <path d="m17 8-5-5-5 5" />
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    </template>
    <template v-else-if="name === 'download'">
      <path d="M12 15V3" />
      <path d="m17 10-5 5-5-5" />
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    </template>
    <template v-else-if="name === 'arrow-up-down'">
      <path d="m21 16-4 4-4-4" />
      <path d="M17 20V4" />
      <path d="m3 8 4-4 4 4" />
      <path d="M7 4v16" />
    </template>
    <template v-else-if="name === 'image'">
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </template>
    <template v-else-if="name === 'file'">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </template>
    <template v-else-if="name === 'music'">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </template>
    <template v-else-if="name === 'layout'">
      <rect width="7" height="9" x="3" y="3" rx="1" />
      <rect width="7" height="5" x="14" y="3" rx="1" />
      <rect width="7" height="9" x="14" y="12" rx="1" />
      <rect width="7" height="5" x="3" y="16" rx="1" />
    </template>
    <template v-else-if="name === 'workflow'">
      <rect width="8" height="8" x="3" y="3" rx="2" />
      <path d="M7 11v4a2 2 0 0 0 2 2h4" />
      <rect width="8" height="8" x="13" y="13" rx="2" />
    </template>
    <template v-else-if="name === 'arrow-left'">
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </template>
    <template v-else-if="name === 'arrow-right'">
      <path d="m12 5 7 7-7 7" />
      <path d="M5 12h14" />
    </template>
    <template v-else-if="name === 'trash'">
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </template>
    <template v-else-if="name === 'users'">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </template>
    <template v-else-if="name === 'message'">
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </template>
    <template v-else-if="name === 'file-text'">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </template>
    <template v-else-if="name === 'copy'">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16V4a2 2 0 0 1 2-2h10" />
    </template>
    <template v-else-if="name === 'lock'">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </template>
    <template v-else-if="name === 'link'">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </template>
    <template v-else-if="name === 'share'">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" x2="15.42" y1="13.51" y2="17.49" />
      <line x1="15.41" x2="8.59" y1="6.51" y2="10.49" />
    </template>
    <template v-else-if="name === 'phone'">
      <path
        d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
      />
    </template>
    <template v-else-if="name === 'shield'">
      <path
        d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
      />
    </template>
    <template v-else-if="name === 'wand'">
      <path d="M15 4V2" />
      <path d="M15 16v-2" />
      <path d="M8 9h2" />
      <path d="M20 9h2" />
      <path d="M17.8 11.8 19 13" />
      <path d="M15 9h.01" />
      <path d="M17.8 6.2 19 5" />
      <path d="m3 21 9-9" />
      <path d="M12.2 6.2 11 5" />
    </template>
    <template v-else-if="name === 'refresh'">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </template>
    <template v-else-if="name === 'pencil'">
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </template>
    <template v-else-if="name === 'book'">
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
    </template>
    <template v-else-if="name === 'clock'">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </template>
    <template v-else-if="name === 'list-todo'">
      <rect x="3" y="5" width="6" height="6" rx="1" />
      <path d="m3 17 2 2 4-4" />
      <path d="M13 6h8" />
      <path d="M13 12h8" />
      <path d="M13 18h8" />
    </template>
    <template v-else-if="name === 'scissors'">
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="20" x2="8.12" y1="4" y2="15.88" />
      <line x1="14.47" x2="20" y1="14.48" y2="20" />
      <line x1="8.12" x2="12" y1="8.12" y2="12" />
    </template>
    <template v-else-if="name === 'mouse-pointer'">
      <!-- lucide mouse-pointer-2：与 updream 选中模式一致 -->
      <path
        d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"
      />
    </template>
    <template v-else-if="name === 'info'">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </template>
    <template v-else-if="name === 'hand'">
      <path d="M18 11V6a2 2 0 0 0-4 0" />
      <path d="M14 10V4a2 2 0 0 0-4 0v2" />
      <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </template>
    <template v-else-if="name === 'minus'">
      <path d="M5 12h14" />
    </template>
    <template v-else-if="name === 'maximize'">
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </template>
    <template v-else-if="name === 'eye'">
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876.001 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </template>
    <template v-else-if="name === 'eye-off'">
      <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
      <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
      <path d="M17.479 17.499A10.75 10.75 0 0 1 2.062 12.347a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.268-5.275" />
      <path d="m2 2 20 20" />
    </template>
    <template v-else-if="name === 'undo'">
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.7 3L3 13" />
    </template>
    <template v-else-if="name === 'redo'">
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6.7 3L21 13" />
    </template>
    <template v-else-if="name === 'more-horizontal'">
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </template>
    <template v-else-if="name === 'more-vertical'">
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="19" r="1" />
    </template>
    <template v-else-if="name === 'clapperboard'">
      <path
        fill="currentColor"
        stroke="none"
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M17.5 7.5a3 3 0 0 1 3 3v7a3 3 0 0 1-2.846 2.996L17.5 18.5h-11l-.154-.004a3 3 0 0 1-2.842-2.842L3.5 15.5v-7a3 3 0 0 1 3-3h11ZM6.5 9A1.5 1.5 0 0 0 5 10.5v7A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 17.5 9h-.507l-2.962 3.455a.7.7 0 1 1-1.062-.91L15.15 9h-3.657l-2.962 3.455a.7.7 0 0 1-1.062-.91L9.65 9H6.5Zm12.9-5.743a.75.75 0 0 1 .2 1.486l-15 2a.75.75 0 0 1-.2-1.486l15-2Z"
      />
    </template>
    <template v-else-if="name === 'cloud'">
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
    </template>
    <template v-else-if="name === 'cloud-download'">
      <path d="M12 13v8l-4-4" />
      <path d="m12 21 4-4" />
      <path d="M4.393 15.269A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.436 8.284" />
    </template>
    <template v-else-if="name === 'quote'">
      <path
        d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"
      />
      <path
        d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"
      />
    </template>
    <template v-else-if="name === 'check'">
      <path d="M20 6 9 17l-5-5" />
    </template>
    <template v-else-if="name === 'x'">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </template>
    <template v-else-if="name === 'folder-plus'">
      <path
        d="M12 10v6"
      />
      <path d="M9 13h6" />
      <path
        d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"
      />
    </template>
    <template v-else-if="name === 'folder-input'">
      <path
        d="M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1"
      />
      <path d="M2 13h10" />
      <path d="m9 16 3-3-3-3" />
    </template>
    <template v-else-if="name === 'terminal'">
      <path
        fill="currentColor"
        stroke="none"
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M7.5 4.25C7.5 2.46 8.96 1 10.75 1h2.5c1.79 0 3.25 1.46 3.25 3.25V5h3c1.1 0 2 .9 2 2v2.25c0 .41-.34.75-.75.75h-.25v8.5c0 1.66-1.34 3-3 3h-11c-1.66 0-3-1.34-3-3V10h-.25c-.41 0-.75-.34-.75-.75V7c0-1.1.9-2 2-2h3v-.75zm1.5 0c0-.97.78-1.75 1.75-1.75h2.5c.97 0 1.75.78 1.75 1.75V5H9v-.75zM4.5 6.5c-.28 0-.5.22-.5.5v1.5h16V7c0-.28-.22-.5-.5-.5h-15zM5 10v8.5c0 .83.67 1.5 1.5 1.5h11c.83 0 1.5-.67 1.5-1.5V10H5zm4.5 2.75c0-.41.34-.75.75-.75h3.5c.41 0 .75.34.75.75s-.34.75-.75.75h-3.5c-.41 0-.75-.34-.75-.75z"
      />
    </template>
    <!-- 底栏：视频 -->
    <template v-else-if="name === 'film'">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M7 3v18" />
      <path d="M17 3v18" />
      <path d="M3 7.5h4" />
      <path d="M3 12h18" />
      <path d="M3 16.5h4" />
      <path d="M17 7.5h4" />
      <path d="M17 16.5h4" />
    </template>
    <!-- 底栏：Agent -->
    <template v-else-if="name === 'bot'">
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M9 13v2" />
      <path d="M15 13v2" />
    </template>
    <!-- 底栏：画面文字 T -->
    <template v-else-if="name === 'type'">
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" x2="15" y1="20" y2="20" />
      <line x1="12" x2="12" y1="4" y2="20" />
    </template>
    <!-- 底栏：@ -->
    <template v-else-if="name === 'at-sign'">
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
    </template>
    <!-- 底栏：画幅比例 -->
    <template v-else-if="name === 'ratio'">
      <rect width="12" height="18" x="6" y="3" rx="2" />
      <path d="M3 9h3" />
      <path d="M18 15h3" />
    </template>
    <!-- 底栏：模型 -->
    <template v-else-if="name === 'cpu'">
      <rect width="16" height="16" x="4" y="4" rx="2" />
      <rect width="6" height="6" x="9" y="9" rx="1" />
      <path d="M15 2v2" />
      <path d="M15 20v2" />
      <path d="M2 15h2" />
      <path d="M2 9h2" />
      <path d="M20 15h2" />
      <path d="M20 9h2" />
      <path d="M9 2v2" />
      <path d="M9 20v2" />
    </template>
    <template v-else-if="name === 'infinity'">
      <path
        d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z"
      />
    </template>
    <template v-else-if="name === 'layers'">
      <path
        d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"
      />
      <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
      <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
    </template>
    <template v-else-if="name === 'images'">
      <path
        fill="currentColor"
        stroke="none"
        d="M11.095 5.029a2.65 2.65 0 0 1 3.396-1.584l5.356 1.95a2.651 2.651 0 0 1 1.584 3.397l-1.813 4.977 1.902 3.294c.793 1.373-.142 3.078-1.688 3.183l-.151.005h-7.362c-.876 0-1.575-.51-1.91-1.2a6.25 6.25 0 1 1-.077-11.927l.763-2.095Zm5.446 6.41a.625.625 0 0 0-1.082 0l-3.68 6.374c-.24.417.06.938.54.938h7.362c.48 0 .78-.521.54-.938l-3.68-6.375ZM8.5 8.35a4.75 4.75 0 1 0 1.787 9.15c.032-.102.072-.203.121-.303l.072-.134 1.608-2.787-1.358-.494a2.65 2.65 0 0 1-1.584-3.397l.671-1.848A4.75 4.75 0 0 0 8.5 8.35Zm5.479-3.495a1.15 1.15 0 0 0-1.475.688l-1.95 5.355a1.15 1.15 0 0 0 .688 1.475l1.608.585 1.31-2.27c.818-1.416 2.862-1.416 3.68 0l.8 1.386 1.381-3.795a1.15 1.15 0 0 0-.687-1.475l-5.355-1.949Z"
      />
    </template>
  </svg>
</template>

<style scoped>
.ui-icon {
  display: block;
  flex-shrink: 0;
}
</style>
