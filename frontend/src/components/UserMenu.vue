<template>
  <div class="user-menu" :class="{ 'user-menu--rail': rail }" ref="rootEl">
    <button type="button" class="user-trigger" aria-label="账号菜单" @click="open = !open">
      <span class="avatar">
        <img v-if="auth.avatarUrl" :src="auth.avatarUrl" alt="" />
        <span v-else>{{ initial }}</span>
      </span>
      <UiIcon v-if="!rail" name="chevron-down" :size="14" class="caret" />
    </button>

    <div v-if="open" class="user-pop" :class="{ 'user-pop--rail': rail }" role="menu">
      <div class="pop-head">
        <span class="pop-avatar">
          <img v-if="auth.avatarUrl" :src="auth.avatarUrl" alt="" />
          <span v-else>{{ initial }}</span>
        </span>
        <div class="pop-meta">
          <strong>{{ auth.displayName || '用户' }}</strong>
          <button type="button" class="id-row" title="复制 ID" @click="copyId">
            <em>ID:{{ userId }}</em>
            <UiIcon name="copy" :size="12" />
          </button>
        </div>
        <button type="button" class="team-switch" @click="onSoon('切换团队')">
          <UiIcon name="refresh" :size="13" />
          <span>切换团队</span>
        </button>
      </div>

      <div class="pop-sep" />

      <button type="button" class="pop-item" role="menuitem" @click="goSettings">
        <UiIcon name="settings" :size="16" />
        <span>账号设置</span>
      </button>

      <a
        v-if="auth.isAdmin"
        class="pop-item"
        role="menuitem"
        href="/admin/"
        target="_blank"
        rel="noopener"
        @click="open = false"
      >
        <UiIcon name="shield" :size="16" />
        <span>管理后台</span>
      </a>

      <div
        class="pop-item theme-row"
        role="button"
        tabindex="0"
        :aria-pressed="theme.isDark"
        @click="theme.toggle()"
        @keydown.enter="theme.toggle()"
        @keydown.space.prevent="theme.toggle()"
      >
        <div class="theme-left">
          <UiIcon name="moon" :size="16" />
          <span>深色模式</span>
        </div>
        <button
          type="button"
          class="theme-switch"
          :class="{ dark: theme.isDark }"
          :aria-pressed="theme.isDark"
          title="切换主题"
          @click.stop="theme.toggle()"
        >
          <span class="sw-knob">
            <UiIcon :name="theme.isDark ? 'moon' : 'sun'" :size="12" />
          </span>
        </button>
      </div>

      <div class="pop-sep" />

      <button type="button" class="pop-item danger" role="menuitem" @click="logout">
        <UiIcon name="log-out" :size="16" />
        <span>退出登录</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';
import { copyText } from '@/utils/clipboard';
import UiIcon from '@/components/icons/UiIcon.vue';

withDefaults(
  defineProps<{
    /** 侧栏底部模式：仅头像，弹层向上展开 */
    rail?: boolean;
  }>(),
  { rail: false },
);

const auth = useAuthStore();
const theme = useThemeStore();
const router = useRouter();

const open = ref(false);
const rootEl = ref<HTMLElement | null>(null);

const initial = computed(() => {
  const n = String(auth.displayName || auth.user?.username || 'U').trim();
  return (n[0] || 'U').toUpperCase();
});

const userId = computed(() => {
  const id = auth.user?.id;
  if (id == null) return '—';
  return String(id).slice(0, 12);
});

function onDocClick(e: MouseEvent) {
  if (!open.value) return;
  const el = rootEl.value;
  if (el && !el.contains(e.target as Node)) open.value = false;
}

onMounted(() => {
  void auth.ensureUser(true);
  document.addEventListener('mousedown', onDocClick);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', onDocClick);
});

async function copyId() {
  const ok = await copyText(String(auth.user?.id ?? ''));
  if (ok) ElMessage.success('已复制 ID');
  else ElMessage.warning('复制失败');
}

function onSoon(label: string) {
  ElMessage.info(`${label}即将开放`);
  open.value = false;
}

function goSettings() {
  open.value = false;
  router.push({ path: '/settings', query: { section: 'account' } });
}

function logout() {
  open.value = false;
  void auth.logout().then(() => router.push('/login'));
}
</script>

<style scoped>
.user-menu {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.user-menu--rail {
  width: 100%;
  justify-content: center;
}

.user-trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 36px;
  padding: 0 4px 0 2px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--studio-ink);
  font: inherit;
  cursor: pointer;
}
.user-menu--rail .user-trigger {
  height: 44px;
  width: 44px;
  padding: 0;
  justify-content: center;
}
.user-trigger:hover {
  background: var(--studio-glass-2);
}

.avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  overflow: hidden;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  border: 1px solid var(--studio-line-strong);
}
.user-menu--rail .avatar {
  width: 36px;
  height: 36px;
  font-size: 14px;
}
.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.caret {
  color: var(--studio-faint);
}

.user-pop {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 80;
  width: 280px;
  padding: 12px 8px 8px;
  border-radius: 18px;
  background: var(--studio-panel);
  border: 1px solid var(--studio-line-strong);
  box-shadow: var(--studio-shadow);
  color: var(--studio-ink);
}
.user-pop--rail {
  top: auto;
  bottom: calc(100% + 10px);
  left: calc(100% + 10px);
  right: auto;
}

.pop-head {
  display: grid;
  grid-template-columns: 40px 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 4px 8px 12px;
}
.pop-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
}
.pop-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.pop-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pop-meta strong {
  font-size: 14px;
  font-weight: 650;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.id-row {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  background: transparent;
  color: var(--studio-faint);
  font: inherit;
  padding: 0;
  cursor: pointer;
  width: fit-content;
}
.id-row em {
  font-style: normal;
  font-size: 12px;
}
.id-row:hover {
  color: var(--studio-muted);
}
.team-switch {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  background: transparent;
  color: var(--studio-muted);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  padding: 4px;
  border-radius: 8px;
  align-self: start;
  white-space: nowrap;
}
.team-switch:hover {
  color: var(--studio-ink);
  background: var(--studio-glass-2);
}

.pop-sep {
  height: 1px;
  margin: 4px 8px;
  background: var(--studio-line-strong);
}

.pop-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  height: 40px;
  padding: 0 12px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--studio-text);
  font: inherit;
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  text-decoration: none;
  box-sizing: border-box;
}
.pop-item:hover {
  background: var(--studio-glass-2);
}
.pop-item.danger:hover {
  color: #fca5a5;
}

.theme-row {
  justify-content: space-between;
  cursor: pointer;
}
.theme-row:hover {
  background: transparent;
}
.theme-left {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

.theme-switch {
  width: 52px;
  height: 28px;
  padding: 2px;
  border: 0;
  border-radius: 999px;
  background: var(--studio-panel-3);
  cursor: pointer;
  position: relative;
  flex-shrink: 0;
}
.theme-switch .sw-knob {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #3f3f46;
  color: #fafafa;
  display: grid;
  place-items: center;
  transition: transform 0.18s ease;
  transform: translateX(0);
}
.theme-switch.dark .sw-knob {
  transform: translateX(24px);
  background: #52525b;
}
</style>
