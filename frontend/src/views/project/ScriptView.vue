<template>
  <div class="page write-page studio-book nested">
    <header class="tool-head">
      <p class="tool-sub">
        <template v-if="pageMode === 'chapters'">
          {{ chapters.length ? `共 ${chapters.length} 章` : '点「生成下一章」，正文在右侧流式出现' }}
        </template>
        <template v-else>
          {{
            characterList.length
              ? `共 ${characterList.length} 人${hasLeadCharacter ? '' : ' · 尚未标注主角'}`
              : '写章时会自动带出角色，也可手动新建'
          }}
        </template>
      </p>
      <div v-if="pageMode === 'chapters'" class="tool-actions">
        <el-button v-if="streaming" type="danger" plain round @click="cancelStream">停止</el-button>
        <el-dropdown :disabled="streaming" trigger="click" @command="onMoreWrite">
          <button type="button" class="pill-btn" :disabled="streaming">
            更多
            <UiIcon name="chevron-down" :size="14" />
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item :command="{ type: 'batch', n: 3 }">连写 3 章</el-dropdown-item>
              <el-dropdown-item :command="{ type: 'batch', n: 5 }">连写 5 章</el-dropdown-item>
              <el-dropdown-item :command="{ type: 'batch', n: 10 }">连写 10 章</el-dropdown-item>
              <el-dropdown-item
                :command="{ type: 'wrap', n: 3 }"
                :disabled="!chapters.length"
                divided
              >
                收束连写 3 章
              </el-dropdown-item>
              <el-dropdown-item :command="{ type: 'wrap', n: 5 }" :disabled="!chapters.length">
                收束连写 5 章
              </el-dropdown-item>
              <el-dropdown-item :command="{ type: 'wrap', n: 8 }" :disabled="!chapters.length">
                收束连写 8 章
              </el-dropdown-item>
              <el-dropdown-item :command="{ type: 'finale' }" :disabled="!chapters.length">
                单章强行完结
              </el-dropdown-item>
              <el-dropdown-item :command="{ type: 'continuity' }" divided>
                连贯检查
                <span v-if="openHookCount" class="menu-badge">{{ openHookCount }}</span>
              </el-dropdown-item>
              <el-dropdown-item :command="{ type: 'export' }" :disabled="!chapters.length">
                导出全文
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <button
          type="button"
          class="pill-btn primary"
          :disabled="streaming"
          @click="genNextChapter"
        >
          {{ streaming ? '生成中…' : '生成下一章' }}
        </button>
      </div>
      <div v-else class="tool-actions">
        <button
          type="button"
          class="pill-btn"
          :disabled="!characterList.length"
          @click="onExportCharacters('bible')"
        >
          导出设定
        </button>
        <button type="button" class="pill-btn primary" @click="startNewCharacter">新建角色</button>
        <div class="char-view-switch">
          <button
            type="button"
            class="view-btn"
            :class="{ on: charViewMode === 'roster' }"
            @click="charViewMode = 'roster'"
          >
            名册
          </button>
          <button
            type="button"
            class="view-btn"
            :class="{ on: charViewMode === 'graph' }"
            @click="charViewMode = 'graph'"
          >
            关系图
          </button>
        </div>
      </div>
    </header>

    <div v-if="pageMode === 'chapters'" class="write-body">
        <div class="chapter-workspace">
          <aside class="chapter-sider">
            <div class="sider-head">
              <strong>章节</strong>
              <el-dropdown :disabled="!chapters.length" trigger="click" @command="onExportNovel">
                <button
                  type="button"
                  class="sider-export"
                  :disabled="!chapters.length"
                  title="导出"
                  aria-label="导出"
                >
                  <el-icon :size="15"><Download /></el-icon>
                </button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="chapter-docx" :disabled="!activeChapterId">
                      当前章节 Word
                    </el-dropdown-item>
                    <el-dropdown-item command="chapter-txt" :disabled="!activeChapterId">
                      当前章节 TXT
                    </el-dropdown-item>
                    <el-dropdown-item command="docx" divided>全部章节 Word</el-dropdown-item>
                    <el-dropdown-item command="txt">全部章节 TXT</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>

            <UiScroll class="sider-scroll chapters-only" always>
              <div v-if="!chapters.length" class="meta-empty pad">
                {{ hasOutline ? '点「生成下一章」开始写' : '暂无大纲，可先到「大纲」页查看' }}
              </div>
              <nav v-else class="chapter-plain">
                <div
                  v-for="ch in chapters"
                  :key="ch.id"
                  class="chapter-plain-row"
                  :class="{
                    active: activeChapterId === ch.id,
                    streaming: streaming && chapterGen.chapterId === ch.id,
                  }"
                >
                  <button
                    type="button"
                    class="chapter-plain-link"
                    @click="selectChapter(ch)"
                  >
                    {{ chapterPlainLabel(ch) }}
                  </button>
                  <button
                    type="button"
                    class="chapter-plain-copy"
                    title="复制本章正文"
                    aria-label="复制本章正文"
                    @click.stop="copyChapterBody(ch)"
                  >
                    <el-icon :size="13"><DocumentCopy /></el-icon>
                  </button>
                  <el-dropdown
                    trigger="click"
                    @command="(cmd: string) => onChapterCmd(cmd, ch)"
                    @click.stop
                  >
                    <button type="button" class="chapter-plain-more" @click.stop aria-label="章节操作">
                      <span class="chapter-plain-more-dots" aria-hidden="true" />
                    </button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item command="copy">复制正文</el-dropdown-item>
                        <el-dropdown-item command="rewrite" :disabled="streaming">重写本章</el-dropdown-item>
                        <el-dropdown-item command="deai" :disabled="streaming || busy">去味润色</el-dropdown-item>
                        <el-dropdown-item command="delete" :disabled="streaming" divided>
                          删除
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </nav>
            </UiScroll>
          </aside>

          <section class="chapter-pane">
            <div v-if="streaming || streamStatus" class="stream-banner">
              <span class="stream-dot" :class="{ on: streaming }" />
              <span>{{ streamStatus || (streaming ? '正在生成…' : '') }}</span>
              <span v-if="streaming && chapterGen.draft" class="muted">
                已写 {{ (chapterGen.draft.novelBody || '').length }} 字
              </span>
            </div>

            <div v-if="editingChapter" class="chapter-editor">
              <div class="editor-head">
                <el-input
                  v-if="titleEditing"
                  ref="titleInputRef"
                  v-model="editingChapter.title"
                  class="title-input"
                  placeholder="章标题"
                  @blur="finishTitleEdit"
                  @keydown.enter.prevent="finishTitleEdit"
                />
                <button
                  v-else
                  type="button"
                  class="title-display"
                  :disabled="streaming"
                  :title="streaming ? '' : '点击编辑标题'"
                  @click="startTitleEdit"
                >
                  {{ editingChapter.title || '未命名章节' }}
                </button>
                <button
                  type="button"
                  class="title-copy"
                  title="复制章节名称"
                  aria-label="复制章节名称"
                  :disabled="!(editingChapter.title || '').trim()"
                  @click="copyChapterTitle"
                >
                  <el-icon :size="16"><DocumentCopy /></el-icon>
                </button>
              </div>

              <div class="editor-body">
                <NovelTxtEditor
                  ref="bodyInputRef"
                  v-model="editingChapter.novelBody"
                  :title="`${editingChapter.title || '未命名章节'}.txt`"
                  :readonly="streaming"
                  with-plan
                  placeholder="点「生成下一章」：AI 会先规划细纲再写正文"
                  @plan="openRefPanel()"
                />
              </div>
            </div>
            <div v-else class="pane-empty">
              <p v-if="chapters.length || hasOutline">从左侧选一章，或点「生成下一章」开始写。</p>
              <p v-else>点「生成下一章」开始写；大纲可在「大纲」页查看。</p>
            </div>
          </section>
        </div>
    </div>

    <div v-else class="write-body">
      <div class="characters-pane">
        <p v-if="characterList.length && !hasLeadCharacter" class="chars-style warn">
          还没有标注「主角」。编辑角色时把主视角人物标成「主角」。
        </p>

        <div v-if="charViewMode === 'graph'" class="char-graph-pane">
          <CharacterRelationGraph
            v-if="characterList.length"
            :characters="characterList"
            :lead-id="inferredLeadId"
            :selected-id="graphSelectedId"
            @select="graphSelectedId = $event"
            @open="openCharFromGraph"
          />
          <el-empty
            v-else
            description="暂无角色。生成章节后会自动带出，也可点「新建角色」"
            :image-size="72"
          />
        </div>

        <UiScroll v-else class="char-table-wrap" always>
          <el-empty
            v-if="!characterList.length"
            description="暂无角色。写章后会自动带出，也可点「新建角色」"
            :image-size="80"
          >
            <el-button type="primary" round @click="startNewCharacter">新建角色</el-button>
          </el-empty>
          <el-table
            v-else
            :data="sortedCharacters"
            class="char-table"
            row-key="id"
            table-layout="fixed"
            highlight-current-row
            :current-row-key="activeCharacterId || undefined"
            @row-click="(row: any) => selectCharacter(row)"
          >
            <el-table-column prop="name" label="姓名" width="120" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="char-name-cell">{{ row.name || '未命名' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="身份站位" width="130" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="cell-clip">{{ displayStoryRole(row, inferredLeadId) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="职务" min-width="140" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="cell-clip">{{ occupationLine(row) || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="阵营" width="96" align="center">
              <template #default="{ row }">
                <span class="camp-pill" :class="campToneOfRow(row)">{{ campLabelOfRow(row) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="简介" min-width="220" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="cell-clip">{{ truncateText(row.description, 72) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120" align="right">
              <template #default="{ row }">
                <div class="table-ops">
                  <button type="button" class="table-link" @click.stop="selectCharacter(row)">
                    编辑
                  </button>
                  <button type="button" class="table-link danger" @click.stop="removeChar(row.id)">
                    删除
                  </button>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </UiScroll>
      </div>
    </div>

    <el-drawer
      v-model="charDrawerOpen"
      :title="charForm?.id ? charForm.name || '编辑角色' : '新建角色'"
      size="420px"
      destroy-on-close
      class="char-drawer"
      @closed="onCharDrawerClosed"
    >
      <div v-if="charForm" class="char-drawer-body">
        <el-form label-position="top">
          <el-form-item label="姓名">
            <el-input v-model="charForm.name" placeholder="角色姓名" />
          </el-form-item>
          <el-form-item label="身份站位">
            <div class="role-chips">
              <button
                v-for="r in STORY_ROLES"
                :key="r.value"
                type="button"
                class="role-chip"
                :class="{ on: charForm.meta.role === r.value }"
                @click="onPickRole(r.value)"
              >
                <strong>{{ r.value }}</strong>
                <span>{{ r.hint }}</span>
              </button>
            </div>
          </el-form-item>
          <el-form-item label="职务 / 门派身份">
            <el-input
              v-model="charForm.meta.occupation"
              placeholder="如：青云宗外门杂役（与站位分开）"
            />
          </el-form-item>
          <el-form-item label="正邪阵营">
            <div class="role-chips camp-chips">
              <button
                v-for="c in STORY_CAMPS"
                :key="c.value"
                type="button"
                class="role-chip"
                :class="[c.tone, { on: charForm.meta.camp === c.value }]"
                @click="charForm.meta.camp = c.value"
              >
                <strong>{{ c.value }}</strong>
                <span>{{ c.hint }}</span>
              </button>
            </div>
          </el-form-item>
          <el-form-item label="简介">
            <el-input v-model="charForm.description" type="textarea" :rows="3" />
          </el-form-item>
          <el-form-item label="一致关键词">
            <el-input
              v-model="charForm.consistencyPrompt"
              placeholder="可选，锁定称呼口癖等"
            />
          </el-form-item>
          <el-form-item label="声线口癖">
            <el-input v-model="charForm.meta.voiceStyle" />
          </el-form-item>
          <el-form-item label="绝不会做">
            <el-input v-model="charForm.meta.oocNever" />
          </el-form-item>
        </el-form>
        <div class="char-drawer-foot">
          <el-button round @click="charDrawerOpen = false">取消</el-button>
          <el-button type="primary" round :loading="busy" @click="saveChar">保存</el-button>
        </div>
      </div>
    </el-drawer>

    <el-drawer
      v-model="refPanelOpen"
      size="420px"
      class="ref-drawer"
      append-to-body
    >
      <template #header>
        <div class="ref-drawer-head">
          <strong>本章规划</strong>
          <span>规划、要点与承接，边写边查</span>
        </div>
      </template>

      <UiScroll class="ref-scroll" always>
        <div v-if="editingChapter" class="ref-chap-banner">
          <strong>{{ chapterPlainLabel(editingChapter) }}</strong>
          <span v-if="statusLabel(editingChapter.status)" class="ref-chap-status">
            {{ statusLabel(editingChapter.status) }}
          </span>
        </div>
        <div v-else class="meta-empty pad">先从左侧选一章，或生成下一章</div>

        <template v-if="editingChapter">
          <section class="meta-block">
            <h3 class="meta-block-title">本章规划</h3>
            <div class="meta-card">
              <template v-if="chapterCardHasPlan">
                <div v-if="planGoalText" class="meta-field">
                  <span class="meta-label">目标</span>
                  <p class="meta-value pre">{{ planGoalText }}</p>
                </div>
                <div v-if="planCastText" class="meta-field">
                  <span class="meta-label">出场</span>
                  <p class="meta-value">{{ planCastText }}</p>
                </div>
                <div v-if="planEventsText" class="meta-field">
                  <span class="meta-label">事件</span>
                  <p class="meta-value pre">{{ planEventsText }}</p>
                </div>
                <div v-if="planHookText" class="meta-field">
                  <span class="meta-label">钩子</span>
                  <p class="meta-value pre">{{ planHookText }}</p>
                </div>
              </template>
              <div v-else class="meta-empty">生成章节时会写入本章规划</div>
            </div>
          </section>
          <section class="meta-block">
            <h3 class="meta-block-title">章要点</h3>
            <div class="meta-card">
              <p class="meta-value pre" :class="{ empty: !editingChapter.synopsis }">
                {{ editingChapter.synopsis || '生成完成后自动写入' }}
              </p>
            </div>
          </section>
          <section class="meta-block">
            <h3 class="meta-block-title">承接摘要</h3>
            <div class="meta-card">
              <p
                class="meta-value pre"
                :class="{ empty: !editingChapter.continuitySummary }"
              >
                {{ editingChapter.continuitySummary || '给下一章用，生成后自动写入' }}
              </p>
            </div>
          </section>
          <section v-if="liveTimelineNote" class="meta-block">
            <h3 class="meta-block-title">时间线备忘</h3>
            <div class="meta-card">
              <p class="meta-value pre">{{ liveTimelineNote }}</p>
            </div>
          </section>
          <section v-if="openHookCount" class="meta-block">
            <h3 class="meta-block-title">未收束钩子 · {{ openHookCount }}</h3>
            <div class="meta-card">
              <ul class="ref-hook-list">
                <li v-for="h in liveOpenHooks.slice(0, 8)" :key="h.id">{{ h.text }}</li>
              </ul>
              <button type="button" class="ref-inline-link" @click="openContinuityFromRef">
                查看连贯一览
              </button>
            </div>
          </section>
        </template>
      </UiScroll>
    </el-drawer>

    <el-dialog
      v-model="continuityDialog"
      width="560px"
      destroy-on-close
      align-center
      :teleported="false"
      class="continuity-dialog"
      :show-close="true"
    >
      <template #header>
        <div class="cd-head">
          <div class="cd-kicker">故事台账 · AI 自动</div>
          <div class="cd-title">连贯一览</div>
        </div>
      </template>

      <div class="cd-body">
        <section class="cd-hero">
          <div class="cd-hero-top">
            <span class="cd-hero-label">时间线总览</span>
            <button
              type="button"
              class="cd-link"
              @click="goTimelineFromContinuity"
            >
              打开完整时间线 →
            </button>
          </div>
          <p v-if="liveTimelineNote" class="cd-hero-text">{{ liveTimelineNote }}</p>
          <p v-else class="cd-hero-empty">生成章节后，这里会出现年代与地点跨度速记。</p>
          <div class="cd-hero-stats">
            <div class="cd-stat">
              <strong>{{ liveTimelineCount }}</strong>
              <span>章节点</span>
            </div>
            <div class="cd-stat">
              <strong>{{ liveOpenHooks.length }}</strong>
              <span>未收钩子</span>
            </div>
          </div>
        </section>

        <section class="cd-section">
          <div class="cd-section-head">
            <span>未收束钩子</span>
            <em v-if="liveOpenHooks.length">{{ liveOpenHooks.length }}</em>
          </div>
          <UiScroll v-if="liveOpenHooks.length" class="cd-hooks-scroll" always :max-height="280">
          <ul class="cd-hooks">
            <li v-for="(h, i) in liveOpenHooks" :key="h.id || i" class="cd-hook">
              <span class="cd-hook-mark" aria-hidden="true" />
              <div class="cd-hook-main">
                <p class="cd-hook-text">{{ h.text }}</p>
                <span v-if="h.chapterOrder" class="cd-hook-from">第 {{ h.chapterOrder }} 章埋下</span>
              </div>
            </li>
          </ul>
          </UiScroll>
          <div v-else class="cd-empty-block">
            <p>暂无未收钩子</p>
            <span>写章时 AI 会自动维护；收束连写会逐步消化，末章完结时清空。</span>
          </div>
        </section>
      </div>

      <template #footer>
        <div class="cd-foot">
          <el-button text type="primary" @click="goTimelineFromContinuity">查看时间线</el-button>
          <el-button type="primary" @click="continuityDialog = false">关闭</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  DocumentCopy,
  Download,
} from '@element-plus/icons-vue';
import api from '@/api';
import UiIcon from '@/components/icons/UiIcon.vue';
import { waitJob } from '@/utils/wait-job';
import { scrubOutlineLengthConfusion } from '@/utils/outline-text';
import { copyText } from '@/utils/clipboard';
import { useChapterGenStore } from '@/stores/chapter-gen';
import NovelTxtEditor from '@/components/NovelTxtEditor.vue';
import CharacterRelationGraph from '@/components/CharacterRelationGraph.vue';
import { UiScroll } from '@/components/ui';
import { useProjectStore } from '@/stores/project';
import {
  STORY_CAMPS,
  STORY_ROLES,
  displayStoryRole,
  isStandardStoryRole,
  normalizeStoryRole,
  occupationOfCharacter,
  pickLeadCandidate,
  resolveStoryCamp,
  roleOfCharacter,
  roleTier,
  roleTierOfCharacter,
  storyRoleRank,
  suggestImportStoryCamp,
  suggestImportStoryRole,
  type StoryRole,
} from '@/utils/story-roles';

const route = useRoute();
const router = useRouter();
const store = useProjectStore();
const projectId = computed(() => String(route.params.projectId));
/** 由侧栏路由决定：章节 / 角色 */
const pageMode = computed<'chapters' | 'characters'>(() =>
  route.path.includes('/characters') ? 'characters' : 'chapters',
);
const charViewMode = ref<'roster' | 'graph'>('roster');
const graphSelectedId = ref('');
const charDrawerOpen = ref(false);
const refPanelOpen = ref(false);
const scriptText = ref('');
const busy = ref(false);
const chapters = ref<any[]>([]);
const activeChapterId = ref('');
const editingChapter = ref<any>(null);
const continuityDialog = ref(false);
const characterList = ref<any[]>([]);
const activeCharacterId = ref('');
const charForm = ref<any>(null);
const hasOutline = computed(() => !!scriptText.value.trim());
const liveTimelineNote = computed(() =>
  String(store.current?.storyState?.timelineNote || '').trim(),
);
const liveTimelineCount = computed(() => {
  const tl = store.current?.storyState?.timeline;
  return Array.isArray(tl) ? tl.length : 0;
});
const liveOpenHooks = computed(() => {
  const hooks = store.current?.storyState?.openHooks;
  if (!Array.isArray(hooks)) return [] as Array<{ id: string; text: string; chapterOrder?: number }>;
  return hooks
    .map((h, i) => ({
      id: String(h?.id || `hook-${i + 1}`),
      text: String(h?.text || '').trim(),
      chapterOrder: h?.chapterOrder,
    }))
    .filter((h) => h.text);
});
const openHookCount = computed(() => liveOpenHooks.value.length);

/** 规划字段可能是字符串、数组，或 JSON 数组字符串 */
function formatPlanList(value: unknown, joiner = '、'): string {
  if (value == null) return '';
  const items = (list: unknown[]) =>
    list.map((x) => String(x ?? '').trim()).filter(Boolean);

  if (Array.isArray(value)) return items(value).join(joiner);

  const s = String(value).trim();
  if (!s) return '';
  if (s.startsWith('[')) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return items(parsed).join(joiner);
    } catch {
      /* ignore */
    }
  }
  return s;
}

const planGoalText = computed(() =>
  String(editingChapter.value?.chapterCard?.goal || '').trim(),
);
const planCastText = computed(() =>
  formatPlanList(editingChapter.value?.chapterCard?.cast, '、'),
);
const planEventsText = computed(() =>
  formatPlanList(editingChapter.value?.chapterCard?.keyEvents, '\n'),
);
const planHookText = computed(() =>
  String(editingChapter.value?.chapterCard?.hook || '').trim(),
);
const chapterCardHasPlan = computed(
  () => !!(planGoalText.value || planCastText.value || planEventsText.value || planHookText.value),
);

function sortChars(list: any[]) {
  return [...list].sort((a, b) => {
    const ra = storyRoleRank(roleOfCharacter(a));
    const rb = storyRoleRank(roleOfCharacter(b));
    if (ra !== rb) return ra - rb;
    const ca = resolveStoryCamp(roleOfCharacter(a), bible(a).camp);
    const cb = resolveStoryCamp(roleOfCharacter(b), bible(b).camp);
    if (ca !== cb) return ca.localeCompare(cb, 'zh');
    return String(a.name || '').localeCompare(String(b.name || ''), 'zh');
  });
}

/** 已标注的主角；若没有，推断最像主视角的人（如石小山职务被写成「外门杂役」时） */
const inferredLeadId = computed(() => {
  const labeled = characterList.value.find((row) => roleTierOfCharacter(row) === 'lead');
  if (labeled) return String(labeled.id);
  const guessed = pickLeadCandidate(characterList.value);
  return guessed ? String(guessed.id) : '';
});

const hasLeadCharacter = computed(() =>
  characterList.value.some(
    (row) => isStandardStoryRole(roleOfCharacter(row)) && roleTier(roleOfCharacter(row)) === 'lead',
  ),
);

const sortedCharacters = computed(() => sortChars(characterList.value));

function truncateText(raw: unknown, max = 48) {
  const s = String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '—';
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function occupationLine(row: any) {
  const occ = occupationOfCharacter(row);
  if (occ) return occ;
  const role = roleOfCharacter(row);
  if (role && !isStandardStoryRole(role)) return role;
  return '';
}

function campLabelOfRow(row: any) {
  const explicit = String(bible(row).camp || '').trim();
  if (explicit) return resolveStoryCamp('', explicit);
  const tier = roleTierOfCharacter(row, inferredLeadId.value);
  if (tier === 'antagonist') return '反派';
  if (tier === 'lead' || tier === 'party') return '正派';
  return resolveStoryCamp(roleOfCharacter(row), bible(row).camp);
}

function campToneOfRow(row: any) {
  const label = campLabelOfRow(row);
  if (label === '正派') return 'good';
  if (label === '反派') return 'evil';
  return 'neutral';
}

function onPickRole(role: StoryRole) {
  if (!charForm.value) return;
  charForm.value.meta.role = role;
  if (!charForm.value.meta.camp || charForm.value.meta.camp === '中立') {
    charForm.value.meta.camp = suggestImportStoryCamp(role);
  }
}

function openCharFromGraph(id: string) {
  const row = characterList.value.find((c) => c.id === id);
  if (!row) return;
  charViewMode.value = 'roster';
  selectCharacter(row);
}

function bible(row: any) {
  return row?.meta || {};
}

function statusLabel(s: string) {
  if (s === 'generated') return '已生成';
  if (s === 'edited') return '已编辑';
  return '草稿';
}

function pickOutlineAsset(assets: any[]) {
  if (!assets?.length) return null;
  return (
    assets.find((a) => String(a.name || '') === '小说大纲') ||
    assets.find((a) => String(a.name || '').includes('大纲')) ||
    assets.find((a) => String(a.name || '').startsWith('积木拼装')) ||
    assets[0]
  );
}

async function loadAssets() {
  const { data } = await api.get(`/projects/${projectId.value}/assets`, { params: { type: 'script' } });
  const hit = pickOutlineAsset(data);
  if (hit?.meta?.content) scriptText.value = scrubOutlineLengthConfusion(hit.meta.content);
}

async function loadChapters() {
  const { data } = await api.get(`/projects/${projectId.value}/chapters`);
  chapters.value = data;
  if (activeChapterId.value) {
    const hit = data.find((c: any) => c.id === activeChapterId.value);
    if (hit) editingChapter.value = { ...hit, chapterCard: { ...(hit.chapterCard || {}) } };
  }
}

async function loadCharacters() {
  const { data } = await api.get(`/projects/${projectId.value}/characters`);
  characterList.value = data;
  await repairLeadLabelIfNeeded();
}

/** 把误写成「外门杂役」等职务的主视角角色，纠正为站位「主角」，原职务挪到 occupation */
async function repairLeadLabelIfNeeded() {
  const hasLabeledLead = characterList.value.some(
    (row) => isStandardStoryRole(roleOfCharacter(row)) && roleTier(roleOfCharacter(row)) === 'lead',
  );
  if (hasLabeledLead) return;
  const candidate = pickLeadCandidate(characterList.value);
  if (!candidate?.id) return;
  const role = roleOfCharacter(candidate);
  if (isStandardStoryRole(role) && roleTier(role) === 'lead') return;

  const meta = { ...(candidate.meta || {}) } as Record<string, unknown>;
  if (role && !isStandardStoryRole(role) && !meta.occupation) {
    meta.occupation = role;
  }
  meta.role = '主角';
  if (!meta.camp) meta.camp = '正派';
  try {
    await api.put(`/projects/${projectId.value}/characters/${candidate.id}`, {
      name: candidate.name,
      description: candidate.description,
      consistencyPrompt: candidate.consistencyPrompt,
      meta,
    });
    const { data } = await api.get(`/projects/${projectId.value}/characters`);
    characterList.value = data;
  } catch {
    /* 展示层仍会用 inferredLeadId 归入主角 */
  }
}

const chapterGen = useChapterGenStore();
const streaming = computed(() => chapterGen.isRunningFor(projectId.value));
const streamStatus = computed(() => (streaming.value ? chapterGen.status : ''));
const bodyInputRef = ref<any>(null);
const titleEditing = ref(false);
const titleInputRef = ref<any>(null);

async function startTitleEdit() {
  if (streaming.value) return;
  titleEditing.value = true;
  await nextTick();
  const root = titleInputRef.value?.$el as HTMLElement | undefined;
  const input = root?.querySelector?.('input') as HTMLInputElement | null;
  input?.focus();
  input?.select();
}

function finishTitleEdit() {
  titleEditing.value = false;
  if (editingChapter.value && !String(editingChapter.value.title || '').trim()) {
    editingChapter.value.title = '未命名章节';
  }
  void flushSaveChapter(true);
}

async function copyChapterTitle() {
  const title = String(editingChapter.value?.title || '').trim();
  if (!title) {
    ElMessage.warning('暂无章节名称');
    return;
  }
  const ok = await copyText(title);
  if (ok) ElMessage.success('已复制章节名称');
  else ElMessage.error('复制失败，请手动选择文本复制');
}

async function copyChapterBody(ch: any) {
  const text = String(ch?.novelBody || '');
  if (!text.trim()) {
    ElMessage.warning('该章暂无正文');
    return;
  }
  const ok = await copyText(text);
  if (ok) ElMessage.success('已复制本章正文');
  else ElMessage.error('复制失败，请手动选择文本复制');
}

function liveWordCount(ch: any) {
  const d = chapterGen.draft;
  if (streaming.value && d && d.id === ch.id) {
    return (d.novelBody || '').length;
  }
  return (ch.novelBody || '').length;
}

function cancelStream() {
  chapterGen.cancel();
}

/** 把全局流式草稿同步到当前页编辑器与左侧列表 */
function syncDraftFromStore() {
  if (!streaming.value || !chapterGen.draft) return;
  const d = chapterGen.draft;
  editingChapter.value = { ...d, chapterCard: { ...(d.chapterCard || {}) } };
  activeChapterId.value = d.id;
  if (!chapters.value.some((c) => c.id === d.id)) {
    chapters.value = [...chapters.value, { ...editingChapter.value }];
  } else {
    chapters.value = chapters.value.map((c) =>
      c.id === d.id ? { ...c, ...editingChapter.value } : c,
    );
  }
  void nextTick(() => bodyInputRef.value?.scrollToEnd?.());
}

async function streamChapter(opts?: { chapterId?: string; instruction?: string; finale?: boolean }) {
  if (streaming.value) return;
  if (!scriptText.value.trim()) {
    await loadAssets();
    if (!scriptText.value.trim()) {
      return ElMessage.warning('暂无大纲。大纲在创建项目时生成，可在「大纲」页查看。');
    }
  }

  if (pageMode.value !== 'chapters') {
    await router.push(`/books/${projectId.value}/chapters`);
  }
  titleEditing.value = false;

  const finaleInstruction =
    '本章为完结章：收束主线与核心人物弧光，兑现前文承诺，消化未收束钩子；可写短暂余韵，不要新开大悬念、新反派或新主线。';
  const instruction = String(opts?.instruction || (opts?.finale ? finaleInstruction : '')).trim();

  try {
    // 不 await：请求挂在 store，切页不打断
    void chapterGen.start({
      projectId: projectId.value,
      chapterId: opts?.chapterId,
      instruction: instruction || undefined,
      finale: opts?.finale,
    });
  } catch (e: any) {
    ElMessage.error(e?.message || '启动生成失败');
  }
}

watch(
  () => [chapterGen.draft, chapterGen.status, chapterGen.running] as const,
  () => {
    if (streaming.value) syncDraftFromStore();
  },
  { deep: true },
);

watch(
  () => chapterGen.lastCompletedAt,
  async (ts, prev) => {
    if (!ts || ts === prev) return;
    await loadChapters();
    await loadCharacters();
    try {
      await store.setCurrent(projectId.value);
    } catch {
      /* ignore */
    }
    if (chapters.value.length) {
      const last = chapters.value[chapters.value.length - 1];
      const rewriteId = chapterGen.lastChapterId;
      const hit = rewriteId
        ? chapters.value.find((c) => c.id === rewriteId) || last
        : last;
      selectChapter(hit);
    }
  },
);

async function genNextChapter() {
  if (streaming.value) return;
  try {
    await ElMessageBox.confirm(
      chapters.value.length
        ? '将基于大纲与上一章承接，生成下一章正文。生成过程中可随时停止。确定开始？'
        : '将基于项目大纲生成第一章正文。生成过程中可随时停止。确定开始？',
      '生成下一章',
      {
        type: 'info',
        confirmButtonText: '开始生成',
        cancelButtonText: '取消',
      },
    );
  } catch {
    return;
  }
  await streamChapter();
}

function onMoreWrite(cmd: { type: string; n?: number }) {
  if (!cmd?.type) return;
  if (cmd.type === 'batch') {
    void genBatchChapters(cmd.n || 3);
    return;
  }
  if (cmd.type === 'wrap') {
    void genWrapChapters(cmd.n || 5);
    return;
  }
  if (cmd.type === 'finale') {
    void genFinaleChapter();
    return;
  }
  if (cmd.type === 'continuity') {
    openContinuityPanel();
    return;
  }
  if (cmd.type === 'export') {
    void onExportNovel('docx');
  }
}

function onChapterCmd(cmd: string, ch: any) {
  if (cmd === 'copy') void copyChapterBody(ch);
  else if (cmd === 'rewrite') void rewriteChapter(ch);
  else if (cmd === 'deai') void deAiChapter(ch);
  else if (cmd === 'delete') void removeChapter(ch.id);
}

async function genBatchChapters(count: number | string) {
  const n = Number(count) || 10;
  if (streaming.value) return;
  if (!scriptText.value.trim()) {
    await loadAssets();
    if (!scriptText.value.trim()) {
      return ElMessage.warning('暂无大纲。大纲在创建项目时生成，可在「大纲」页查看。');
    }
  }
  try {
    await ElMessageBox.confirm(
      `将连续生成 ${n} 章：一章完成后自动写下一章，每章承接前文状态与钩子，跟大纲推进主线。\n可随时点「停止生成」中断（已写完的章会保留）。预计耗时较长，确定开始？`,
      `连写 ${n} 章`,
      {
        type: 'info',
        confirmButtonText: `开始连写 ${n} 章`,
        cancelButtonText: '取消',
      },
    );
  } catch {
    return;
  }
  if (pageMode.value !== 'chapters') {
    await router.push(`/books/${projectId.value}/chapters`);
  }
  try {
    void chapterGen.startBatch({
      projectId: projectId.value,
      count: n,
    });
  } catch (e: any) {
    ElMessage.error(e?.message || '启动连写失败');
  }
}

async function genWrapChapters(count: number | string) {
  const n = Number(count) || 5;
  if (streaming.value) return;
  if (!chapters.value.length) {
    return ElMessage.warning('建议先写若干章，再开始收束');
  }
  if (!scriptText.value.trim()) {
    await loadAssets();
    if (!scriptText.value.trim()) {
      return ElMessage.warning('暂无大纲。大纲在创建项目时生成，可在「大纲」页查看。');
    }
  }
  try {
    await ElMessageBox.confirm(
      `将连续生成 ${n} 章收束内容：前 ${n - 1} 章优先消化悬念与钩子，第 ${n} 章作为完结章收束全书。生成过程中可随时停止。确定开始？`,
      '收束连写',
      {
        type: 'warning',
        confirmButtonText: `开始收束 ${n} 章`,
        cancelButtonText: '取消',
      },
    );
  } catch {
    return;
  }
  if (pageMode.value !== 'chapters') {
    await router.push(`/books/${projectId.value}/chapters`);
  }
  try {
    void chapterGen.startBatch({
      projectId: projectId.value,
      count: n,
      mode: 'wrap',
    });
  } catch (e: any) {
    ElMessage.error(e?.message || '启动收束连写失败');
  }
}

async function genFinaleChapter() {
  if (!chapters.value.length) {
    return ElMessage.warning('建议先写若干章，再生成完结章');
  }
  try {
    await ElMessageBox.confirm(
      '将只生成一章并强制完结全书。若钩子和悬念较多，建议改用「收束连写 3/5/8 章」。确定继续？',
      '单章强行完结',
      {
        type: 'warning',
        confirmButtonText: '单章完结',
        cancelButtonText: '取消',
      },
    );
  } catch {
    return;
  }
  await streamChapter({ finale: true });
}

async function rewriteChapter(ch: any) {
  if (streaming.value) return;
  const title = String(ch?.title || '未命名章节').trim() || '未命名章节';
  try {
    await ElMessageBox.confirm(
      `将重写「${title}」：现有正文会被新生成内容覆盖，且不可撤销。确定重写？`,
      '重写本章',
      {
        type: 'warning',
        confirmButtonText: '重写本章',
        cancelButtonText: '取消',
      },
    );
  } catch {
    return;
  }
  selectChapter(ch);
  await streamChapter({ chapterId: ch.id });
}

async function deAiChapter(ch: any) {
  const title = String(ch?.title || '未命名章节').trim() || '未命名章节';
  try {
    await ElMessageBox.confirm(
      `将对「${title}」做去味润色，正文会被改写。确定继续？`,
      '去味润色',
      {
        type: 'warning',
        confirmButtonText: '开始润色',
        cancelButtonText: '取消',
      },
    );
  } catch {
    return;
  }
  busy.value = true;
  try {
    const { data: job } = await api.post(`/projects/${projectId.value}/chapters/${ch.id}/de-ai`, {});
    await waitJob(job.id);
    await loadChapters();
    ElMessage.success('已去味润色');
  } catch (e: any) {
    ElMessage.error(e?.message || '润色失败');
  } finally {
    busy.value = false;
  }
}

function openRefPanel() {
  refPanelOpen.value = true;
}

function openContinuityFromRef() {
  refPanelOpen.value = false;
  openContinuityPanel();
}

function selectChapter(ch: any) {
  void flushSaveChapter(true);
  titleEditing.value = false;
  activeChapterId.value = ch.id;
  editingChapter.value = { ...ch, chapterCard: { ...(ch.chapterCard || {}) } };
  chapterDirty.value = false;
}

function chapterPlainLabel(ch: any) {
  const n = Number(ch?.orderIndex);
  const ord = Number.isFinite(n) && n > 0 ? n : chapters.value.findIndex((c) => c.id === ch?.id) + 1;
  const raw = String(ch?.title || '').trim();
  // 标题已带「第x章」时不再重复前缀
  if (/^第\s*\d+\s*章/.test(raw)) return raw;
  const bare = raw.replace(/^第\s*\d+\s*章\s*/u, '').trim();
  return bare ? `第${ord || 1}章 ${bare}` : `第${ord || 1}章`;
}

function openContinuityPanel() {
  continuityDialog.value = true;
}

function goTimelineFromContinuity() {
  continuityDialog.value = false;
  router.push(`/books/${projectId.value}/timeline`);
}

const chapterDirty = ref(false);
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saveInFlight = false;

function scheduleSaveChapter() {
  if (streaming.value || !editingChapter.value?.id) return;
  chapterDirty.value = true;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void flushSaveChapter(true);
  }, 1200);
}

async function flushSaveChapter(silent = true) {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (streaming.value || !editingChapter.value?.id || saveInFlight) return;
  if (!chapterDirty.value && silent) return;
  chapterDirty.value = false;
  saveInFlight = true;
  try {
    await saveChapter(silent);
  } catch (e: any) {
    chapterDirty.value = true;
    if (!silent) ElMessage.error(e?.message || '保存失败');
  } finally {
    saveInFlight = false;
  }
}

async function saveChapter(silent = false) {
  if (!editingChapter.value?.id) return;
  if (!editingChapter.value.chapterCard) editingChapter.value.chapterCard = {};
  await api.put(`/projects/${projectId.value}/chapters/${editingChapter.value.id}`, {
    title: editingChapter.value.title,
    synopsis: editingChapter.value.synopsis,
    novelBody: editingChapter.value.novelBody,
    continuitySummary: editingChapter.value.continuitySummary,
    chapterCard: editingChapter.value.chapterCard,
  });
  if (!silent) ElMessage.success('已保存');
  await loadChapters();
}

function onChapterShortcut(e: KeyboardEvent) {
  if (pageMode.value !== 'chapters' || !editingChapter.value?.id || streaming.value) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    chapterDirty.value = true;
    void flushSaveChapter(false);
  }
}

async function removeChapter(id: string) {
  const ch = chapters.value.find((c) => c.id === id);
  const title = String(ch?.title || '未命名章节').trim() || '未命名章节';
  try {
    await ElMessageBox.confirm(
      `将删除「${title}」，删除后不可恢复。确定删除？`,
      '删除章节',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        confirmButtonClass: 'el-button--danger',
      },
    );
  } catch {
    return;
  }
  await api.delete(`/projects/${projectId.value}/chapters/${id}`);
  if (activeChapterId.value === id) {
    activeChapterId.value = '';
    editingChapter.value = null;
  }
  await loadChapters();
}

async function downloadBlob(
  url: string,
  fallbackName: string,
  mime?: string,
  opts?: { method?: 'get' | 'post'; data?: any; timeout?: number },
) {
  const method = opts?.method || 'get';
  const res =
    method === 'post'
      ? await api.post(url, opts?.data || {}, {
          responseType: 'blob',
          timeout: opts?.timeout ?? 300000,
        })
      : await api.get(url, { responseType: 'blob', timeout: opts?.timeout });
  const ct = String(res.headers?.['content-type'] || '');
  if (ct.includes('application/json')) {
    const text = await (res.data as Blob).text();
    try {
      const j = JSON.parse(text);
      throw new Error(j?.message || '导出失败');
    } catch (e: any) {
      if (e instanceof Error && e.message !== '导出失败' && !e.message.startsWith('{')) throw e;
      throw new Error(text.slice(0, 200) || '导出失败');
    }
  }
  const blob = new Blob([res.data], {
    type:
      mime ||
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fallbackName;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function readApiError(e: any) {
  const data = e?.response?.data;
  if (data instanceof Blob) {
    const text = await data.text();
    try {
      return JSON.parse(text)?.message || text.slice(0, 200);
    } catch {
      return text.slice(0, 200) || e?.message || '请求失败';
    }
  }
  return e?.response?.data?.message || e?.message || '请求失败';
}

async function downloadChapter(ch: any) {
  try {
    await downloadBlob(
      `/projects/${projectId.value}/chapters/${ch.id}/export-docx`,
      `${ch.title || '章节'}.docx`,
    );
    ElMessage.success('已开始下载');
  } catch (e: any) {
    ElMessage.error(e?.message || '导出失败');
  }
}

const exportingNovel = ref(false);

function currentChapter() {
  return chapters.value.find((c) => c.id === activeChapterId.value) || editingChapter.value;
}

async function onExportNovel(cmd: string) {
  if (cmd === 'chapter-docx' || cmd === 'chapter-txt') {
    const ch = currentChapter();
    if (!ch?.id) return ElMessage.warning('请先选中一章');
    if (cmd === 'chapter-docx') await downloadChapter(ch);
    else await downloadChapterTxt(ch);
    return;
  }
  if (cmd === 'txt') await downloadNovelTxt();
  else await downloadNovelDocx();
}

async function downloadChapterTxt(ch: any) {
  try {
    const title = store.current?.title || '小说';
    await downloadBlob(
      `/projects/${projectId.value}/chapters/${ch.id}/export-txt`,
      `${title}-${ch.title || '章节'}.txt`,
      'text/plain;charset=utf-8',
    );
    ElMessage.success('已开始下载当前章节 TXT');
  } catch (e: any) {
    ElMessage.error(await readApiError(e));
  }
}

async function downloadNovelDocx() {
  if (!chapters.value.length) return ElMessage.warning('暂无章节可导出');
  exportingNovel.value = true;
  try {
    const title = store.current?.title || '小说';
    await downloadBlob(
      `/projects/${projectId.value}/chapters/export/novel`,
      `${title}-全部章节.docx`,
    );
    ElMessage.success('已开始下载 Word');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '导出失败');
  } finally {
    exportingNovel.value = false;
  }
}

async function downloadNovelTxt() {
  if (!chapters.value.length) return ElMessage.warning('暂无章节可导出');
  exportingNovel.value = true;
  try {
    const title = store.current?.title || '小说';
    await downloadBlob(
      `/projects/${projectId.value}/chapters/export/novel-txt`,
      `${title}-全部章节.txt`,
      'text/plain;charset=utf-8',
    );
    ElMessage.success('已开始下载 TXT');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '导出失败');
  } finally {
    exportingNovel.value = false;
  }
}

const exportingChars = ref(false);

async function onExportCharacters(cmd: string) {
  if (cmd === 'bible') return downloadBible();
}

async function downloadBible() {
  if (!characterList.value.length) return ElMessage.warning('暂无角色可导出');
  exportingChars.value = true;
  try {
    const title = store.current?.title || '项目';
    await downloadBlob(
      `/projects/${projectId.value}/chapters/export/character-bible`,
      `${title}-人物设定.docx`,
    );
    ElMessage.success('已开始下载人物设定 Word');
  } catch (e: any) {
    ElMessage.error(e?.message || '导出失败');
  } finally {
    exportingChars.value = false;
  }
}

function emptyCharForm(row?: any) {
  const m = row?.meta || {};
  const app = m.appearance || {};
  const rawRole = String(m.role || '').trim();
  const occupation =
    String(m.occupation || '').trim() ||
    (rawRole && !isStandardStoryRole(rawRole) ? rawRole : '');
  let suggested = '';
  if (isStandardStoryRole(rawRole)) {
    suggested = normalizeStoryRole(rawRole);
  } else if (!row) {
    suggested = suggestImportStoryRole(characterList.value.map((c) => roleOfCharacter(c)));
  } else if (inferredLeadId.value && row.id === inferredLeadId.value) {
    suggested = '主角';
  } else {
    suggested = '重要配角';
  }
  const camp =
    m.camp ||
    (suggested ? suggestImportStoryCamp(suggested) : '') ||
    (!row ? '正派' : '');
  return {
    id: row?.id || '',
    name: row?.name || '',
    description: row?.description || '',
    consistencyPrompt: row?.consistencyPrompt || '',
    meta: {
      role: suggested,
      occupation,
      camp,
      voiceStyle: m.voiceStyle || '',
      oocNever: m.oocNever || '',
      imagePromptZh: m.imagePromptZh || '',
      imagePromptEn: m.imagePromptEn || '',
      appearance: {
        morphology: app.morphology || '',
        face: app.face || '',
        body: app.body || '',
        costume: app.costume || '',
        colors: app.colors || '',
        marks: app.marks || '',
      },
    },
  };
}

function selectCharacter(row: any) {
  activeCharacterId.value = row.id;
  graphSelectedId.value = row.id;
  charForm.value = emptyCharForm(row);
  charDrawerOpen.value = true;
}

function startNewCharacter() {
  charViewMode.value = 'roster';
  activeCharacterId.value = '';
  graphSelectedId.value = '';
  charForm.value = emptyCharForm();
  charDrawerOpen.value = true;
}

function onCharDrawerClosed() {
  if (!charDrawerOpen.value) {
    // keep active highlight; clear only draft new form
    if (charForm.value && !charForm.value.id) {
      charForm.value = null;
    }
  }
}

async function saveChar() {
  const f = charForm.value;
  if (!f?.name?.trim()) return ElMessage.warning('请填写姓名');
  const body = {
    name: f.name,
    description: f.description,
    consistencyPrompt: f.consistencyPrompt,
    meta: f.meta,
  };
  busy.value = true;
  try {
    let savedId = f.id;
    if (f.id) {
      await api.put(`/projects/${projectId.value}/characters/${f.id}`, body);
    } else {
      const { data } = await api.post(`/projects/${projectId.value}/characters`, body);
      savedId = data?.id || '';
    }
    await loadCharacters();
    const hit = characterList.value.find((c) => c.id === savedId);
    if (hit) {
      activeCharacterId.value = hit.id;
      graphSelectedId.value = hit.id;
      charForm.value = emptyCharForm(hit);
    } else {
      activeCharacterId.value = '';
      charForm.value = null;
    }
    charDrawerOpen.value = false;
    ElMessage.success('角色已保存');
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败');
  } finally {
    busy.value = false;
  }
}

async function removeChar(id: string) {
  await api.delete(`/projects/${projectId.value}/characters/${id}`);
  if (activeCharacterId.value === id) {
    activeCharacterId.value = '';
    charForm.value = null;
    charDrawerOpen.value = false;
  }
  if (graphSelectedId.value === id) graphSelectedId.value = '';
  await loadCharacters();
}

function applyChapterQuery() {
  const qid = String(route.query.chapterId || '').trim();
  if (!qid || !chapters.value.length) return false;
  const hit = chapters.value.find((c) => c.id === qid);
  if (!hit) return false;
  selectChapter(hit);
  return true;
}

onMounted(async () => {
  window.addEventListener('keydown', onChapterShortcut);
  await loadAssets();
  await loadChapters();
  await loadCharacters();
  if (streaming.value) {
    syncDraftFromStore();
  } else if (pageMode.value === 'chapters') {
    if (!applyChapterQuery() && chapters.value.length && !editingChapter.value) {
      selectChapter(chapters.value[chapters.value.length - 1]);
    }
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onChapterShortcut);
  void flushSaveChapter(true);
});

watch(
  () => ({
    id: editingChapter.value?.id as string | undefined,
    title: editingChapter.value?.title as string | undefined,
    body: editingChapter.value?.novelBody as string | undefined,
  }),
  (n, o) => {
    if (!o?.id || !n?.id || n.id !== o.id) return;
    if (streaming.value) return;
    scheduleSaveChapter();
  },
);

watch(
  () => route.query.chapterId,
  () => {
    if (pageMode.value === 'chapters') applyChapterQuery();
  },
);
</script>

<style scoped>
.write-page.studio-book.nested {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0 !important;
  box-sizing: border-box;
  background: transparent !important;
  color: var(--studio-ink);
}
.tool-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.tool-sub {
  margin: 0;
  color: var(--studio-faint);
  font-size: 12px;
  line-height: 1.5;
}
.tool-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
  align-items: center;
}
.pill-btn {
  height: 34px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: var(--studio-panel);
  color: var(--studio-text);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.pill-btn:hover:not(:disabled) {
  background: var(--studio-panel-3);
  color: #fff;
}
.pill-btn:disabled {
  opacity: 0.5;
  cursor: wait;
}
.pill-btn.primary {
  background: var(--studio-text);
  color: var(--studio-bg);
  font-weight: 600;
}
.pill-btn.primary:hover:not(:disabled) {
  background: var(--studio-ink);
  color: var(--studio-bg);
}
.ghost-link {
  border: 0;
  background: transparent;
  color: var(--studio-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 6px 4px;
}
.ghost-link:hover {
  color: #fff;
}
.ghost-link:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.ghost-link:disabled:hover {
  color: var(--studio-muted);
}
.menu-badge {
  display: inline-grid;
  place-items: center;
  min-width: 16px;
  height: 16px;
  margin-left: 6px;
  padding: 0 4px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  color: var(--studio-bg);
  background: var(--studio-text);
}
.dropdown-caret {
  margin-left: 6px;
  opacity: 0.75;
  font-size: 11px;
}
.write-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.characters-pane {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.chars-style {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
  flex-shrink: 0;
}
.chars-style.warn {
  color: #fbbf24;
  font-weight: 600;
}
.char-view-switch {
  display: inline-flex;
  height: 34px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--studio-panel);
  padding: 2px;
  gap: 2px;
}
.view-btn {
  border: 0;
  background: transparent;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--studio-muted);
  cursor: pointer;
  font-family: inherit;
}
.view-btn.on {
  background: var(--studio-text);
  color: var(--studio-bg);
}
.char-graph-pane {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.char-table-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border-radius: 16px;
  border: 1px solid var(--studio-line-strong);
  background: var(--studio-panel);
}
.char-table {
  --el-table-border-color: var(--studio-line-strong);
  --el-table-header-bg-color: var(--studio-panel-3);
  --el-table-row-hover-bg-color: var(--studio-glass);
  --el-table-current-row-bg-color: var(--studio-glass-2);
  --el-table-bg-color: var(--studio-panel);
  --el-table-tr-bg-color: var(--studio-panel);
  --el-table-text-color: var(--studio-ink);
  --el-table-header-text-color: var(--studio-muted);
  width: 100%;
  background: var(--studio-panel) !important;
}
.char-table :deep(.el-table__inner-wrapper::before) {
  display: none;
}
.char-table :deep(.el-table__header-wrapper),
.char-table :deep(.el-table__body-wrapper) {
  background: var(--studio-panel);
}
.char-table :deep(th.el-table__cell) {
  font-size: 12px;
  font-weight: 600;
  color: var(--studio-muted) !important;
  background: var(--studio-panel-3) !important;
  border-bottom-color: var(--studio-line-strong) !important;
  height: 44px;
}
.char-table :deep(td.el-table__cell) {
  font-size: 13px;
  color: var(--studio-ink) !important;
  background: var(--studio-panel) !important;
  border-bottom-color: var(--studio-line-strong) !important;
  height: 52px;
}
.char-table :deep(.el-table__body tr:hover > td.el-table__cell) {
  background: var(--studio-panel-3) !important;
}
.char-table :deep(.el-table__body tr.current-row > td.el-table__cell) {
  background: var(--studio-panel-3) !important;
}
.char-table :deep(.el-table__cell .cell) {
  line-height: 1.4;
  overflow: hidden;
  padding-left: 14px;
  padding-right: 14px;
}
.char-table :deep(.el-table__row) {
  cursor: pointer;
}
.cell-clip,
.char-name-cell {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.char-name-cell {
  font-weight: 600;
  color: var(--studio-ink);
}
.camp-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: var(--studio-panel-3);
  color: var(--studio-muted);
  white-space: nowrap;
}
.camp-pill.good {
  background: rgba(74, 222, 128, 0.14);
  color: #60a5fa;
}
.camp-pill.evil {
  background: rgba(248, 113, 113, 0.14);
  color: #f87171;
}
.camp-pill.neutral {
  background: rgba(251, 191, 36, 0.14);
  color: #fbbf24;
}
.table-ops {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  white-space: nowrap;
}
.table-link {
  border: 0;
  background: transparent;
  color: var(--studio-text);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 2px 6px;
}
.table-link.danger {
  color: #f87171;
}
.table-link:hover {
  color: #fff;
}
.table-link.danger:hover {
  color: #fca5a5;
}
.char-drawer-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 100%;
}
.char-drawer-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: auto;
  padding-top: 16px;
  border-top: 1px solid color-mix(in srgb, var(--line) 80%, transparent);
}
.chapter-workspace {
  display: grid;
  grid-template-columns: minmax(200px, 240px) minmax(0, 1fr);
  gap: 0;
  align-items: stretch;
  height: 100%;
  min-height: 0;
  border: 1px solid var(--studio-line-strong);
  border-radius: 16px;
  background: var(--studio-panel);
  overflow: hidden;
}
.chapter-sider {
  border: 0;
  border-right: 1px solid var(--studio-line-strong);
  border-radius: 0;
  background: var(--studio-panel);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  padding: 0;
}
.sider-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 12px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
  flex-shrink: 0;
}
.sider-head strong {
  font-size: 13px;
  font-weight: 750;
  letter-spacing: 0.02em;
  color: var(--muted);
}
.sider-export {
  border: 0;
  background: transparent;
  color: var(--muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 8px;
  cursor: pointer;
}
.sider-export:hover:not(:disabled) {
  color: var(--accent);
  background: var(--hover-bg);
}
.sider-export:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.ref-drawer-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding-right: 12px;
}
.ref-drawer-head strong {
  font-size: 16px;
  font-weight: 600;
  color: var(--studio-ink);
  line-height: 1.3;
}
.ref-drawer-head span {
  font-size: 12px;
  color: var(--studio-faint);
  font-weight: 500;
}
.ref-scroll {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 14px 16px 20px;
}
.ref-scroll :deep(.el-scrollbar__view) {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.ref-chap-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--studio-panel);
  border: 1px solid var(--studio-line-strong);
}
.ref-chap-banner strong {
  font-size: 14px;
  font-weight: 600;
  color: var(--studio-ink);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ref-chap-status {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--studio-muted);
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--studio-panel-3);
}
.ref-hook-list {
  margin: 0;
  padding-left: 1.15em;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ref-hook-list li {
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--studio-text);
}
.ref-inline-link {
  margin-top: 10px;
  border: 0;
  background: transparent;
  color: var(--studio-text);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  text-align: left;
}
.ref-inline-link:hover {
  color: #fff;
  text-decoration: underline;
}
.meta-empty.pad {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding: 20px 8px;
}
.meta-empty.pad p {
  margin: 0;
}
.sider-scroll {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 12px 10px 20px;
}
.meta-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.meta-block-title {
  margin: 0;
  padding: 0 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--studio-ink);
  letter-spacing: 0.01em;
}
.meta-card {
  border-radius: 12px;
  background: var(--studio-panel);
  border: 1px solid var(--studio-line-strong);
  padding: 12px 14px;
  min-width: 0;
}
.meta-card.chapter-name-card {
  padding: 6px;
}
.meta-field + .meta-field {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--studio-line-strong);
}
.meta-label {
  display: block;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--studio-faint);
  margin-bottom: 4px;
}
.meta-value {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--studio-text);
  word-break: break-word;
}
.meta-value.pre,
.person-dl dd.pre {
  white-space: pre-wrap;
}
.meta-value.empty,
.meta-empty {
  color: var(--studio-faint);
  font-size: 12.5px;
  line-height: 1.55;
}
.meta-empty {
  margin: 0;
  padding: 4px 2px;
}
.md-card {
  padding: 10px 12px 12px;
}
.sider-md {
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--text);
  word-break: break-word;
}
.sider-md :deep(h2),
.sider-md :deep(h3),
.sider-md :deep(h4) {
  margin: 12px 0 6px;
  color: var(--ink);
  font-weight: 750;
  line-height: 1.35;
}
.sider-md :deep(h2) {
  font-size: 14px;
}
.sider-md :deep(h3) {
  font-size: 13px;
}
.sider-md :deep(h4) {
  font-size: 12.5px;
}
.sider-md :deep(h2:first-child),
.sider-md :deep(h3:first-child),
.sider-md :deep(h4:first-child) {
  margin-top: 0;
}
.sider-md :deep(p) {
  margin: 0 0 8px;
  white-space: normal;
}
.sider-md :deep(br) {
  display: block;
  content: '';
  margin-top: 0;
}
.sider-md :deep(ul),
.sider-md :deep(ol) {
  margin: 0 0 8px;
  padding-left: 1.2em;
}
.sider-md :deep(li) {
  margin: 0 0 4px;
}
.sider-md :deep(strong) {
  color: var(--ink);
  font-weight: 700;
}
.cast-mini {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cast-mini li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: 12.5px;
}
.cast-mini strong {
  color: var(--ink);
  font-weight: 700;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cast-mini span {
  flex-shrink: 0;
  color: var(--muted);
  font-size: 11.5px;
}
.person-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.person-card {
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
  padding: 12px;
}
.person-card.on {
  border-color: color-mix(in srgb, var(--accent) 35%, var(--line));
  background: color-mix(in srgb, var(--accent-soft) 40%, var(--surface));
}
.person-card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.person-card-head strong {
  font-size: 14px;
  font-weight: 750;
  color: var(--ink);
}
.person-role {
  font-size: 11.5px;
  font-weight: 650;
  color: var(--accent);
}
.person-dl {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.person-dl > div {
  display: grid;
  grid-template-columns: 2.5em minmax(0, 1fr);
  gap: 8px;
  align-items: start;
}
.person-dl dt {
  margin: 0;
  font-size: 11.5px;
  color: var(--muted);
  font-weight: 650;
}
.person-dl dd {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text);
  word-break: break-word;
}
.sider-empty {
  padding: 14px 16px;
  margin: 0;
}
.sider-scroll.chapters-only {
  padding: 8px 8px 20px 10px;
}
.chapter-plain {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 0;
}
.chapter-plain-row {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  padding-right: 2px;
}
.chapter-plain-link {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  padding: 11px 8px;
  margin: 0;
  text-align: left;
  font: inherit;
  font-size: 13.5px;
  font-weight: 500;
  line-height: 1.45;
  color: var(--studio-muted);
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-radius: 8px;
}
.chapter-plain-link:hover {
  color: var(--studio-ink);
  background: var(--studio-glass);
}
.chapter-plain-row.active .chapter-plain-link {
  color: var(--studio-ink);
  background: var(--studio-glass-2);
  font-weight: 600;
}
.chapter-plain-row.streaming .chapter-plain-link {
  color: var(--studio-ink);
  opacity: 0.9;
}
.chapter-plain-copy {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s var(--ease), background 0.15s var(--ease), color 0.15s var(--ease);
}
.chapter-plain-row:hover .chapter-plain-copy {
  opacity: 0.75;
  pointer-events: auto;
}
.chapter-plain-copy:hover {
  opacity: 1;
  color: var(--accent-2, var(--accent));
  background: var(--hover-bg);
}
.chapter-plain-more {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s var(--ease), background 0.15s var(--ease);
}
.chapter-plain-more-dots {
  display: block;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: -5px 0 0 currentColor, 5px 0 0 currentColor;
}
.chapter-plain-row:hover .chapter-plain-more {
  opacity: 0.75;
  pointer-events: auto;
}
.chapter-plain-more:hover,
.chapter-plain-row:hover .chapter-plain-more:hover {
  opacity: 1;
  background: var(--hover-bg);
  color: var(--ink);
}
.chapter-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 4px 12px;
  overflow: hidden;
  flex: 1;
  min-height: 0;
}
.chapter-list.compact {
  padding: 0;
  overflow: hidden;
  flex: none;
  max-height: 220px;
}
.chapter-list.compact.full {
  max-height: none;
  flex: 1;
  min-height: 0;
}
.chapter-card {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: 10px;
  padding: 11px 8px 11px 12px;
  cursor: pointer;
  background: transparent;
  text-align: left;
  font: inherit;
  color: inherit;
  width: 100%;
  transition: background 0.15s var(--ease);
}
.chapter-card:hover {
  background: color-mix(in srgb, var(--hover-bg) 80%, transparent);
}
.chapter-card.active {
  background: var(--accent-soft);
  box-shadow: inset 3px 0 0 var(--accent);
}
.chapter-card.streaming {
  background: color-mix(in srgb, var(--accent-soft) 80%, transparent);
}
.chapter-card-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.chapter-card-main strong {
  font-size: 14px;
  font-weight: 750;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chapter-more {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 16px;
  line-height: 1;
  letter-spacing: 0.05em;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s var(--ease), background 0.15s var(--ease);
}
.chapter-card:hover .chapter-more,
.chapter-card.active .chapter-more {
  opacity: 1;
}
.chapter-more:hover {
  background: color-mix(in srgb, var(--line) 55%, transparent);
  color: var(--ink);
}
.chapter-pane {
  border: 0;
  border-radius: 0;
  background: var(--studio-inset);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  padding: 14px 16px 12px 20px;
  display: flex;
  flex-direction: column;
}
.chapter-pane :deep(.txt-pane) {
  color: var(--studio-ink);
}
.chapter-pane :deep(.txt-bar) {
  border-bottom-color: var(--studio-line-strong);
}
.chapter-pane :deep(.mode-btn.on),
.chapter-pane :deep(.plan-btn) {
  background: var(--studio-panel-3);
  color: var(--studio-ink);
  border-color: var(--studio-line-strong);
}
.chapter-pane :deep(.plan-btn:hover) {
  background: var(--studio-panel-3);
  color: #fff;
}
.stream-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 14px;
  margin-bottom: 10px;
  border-radius: 12px;
  background: var(--studio-panel);
  border: 1px solid var(--studio-line-strong);
  color: var(--studio-ink);
  font-size: 12.5px;
  font-weight: 500;
  flex-shrink: 0;
}
.stream-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--studio-muted);
}
.stream-dot.on {
  background: var(--studio-text);
  box-shadow: 0 0 0 3px var(--studio-glass-3);
  animation: pulse 1.2s ease infinite;
}
@keyframes pulse {
  50% { opacity: 0.45; }
}
.pane-empty {
  flex: 1;
  display: grid;
  place-items: center;
  color: var(--muted);
  font-size: 15px;
  min-height: 240px;
}
.empty-hint {
  color: var(--muted);
  margin: 12px 0 20px;
  font-size: 13px;
  line-height: 1.5;
}
.muted {
  color: var(--muted);
  font-size: 12px;
}
.chapter-editor {
  max-width: none;
  width: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.editor-head {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 14px;
  flex-shrink: 0;
}
.ai-plan {
  flex-shrink: 0;
  margin-bottom: 12px;
  padding: 0;
  border-radius: 12px;
  background: var(--surface-2);
  border: 0;
}
.fold-block {
  overflow: hidden;
}
.fold-summary {
  list-style: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  user-select: none;
  min-width: 0;
}
.fold-summary::-webkit-details-marker {
  display: none;
}
.fold-title {
  font-size: 13px;
  font-weight: 750;
  color: var(--ink);
  flex-shrink: 0;
}
.fold-hint {
  flex: 1;
  min-width: 0;
  margin-left: 2px;
  font-size: 12px;
  font-weight: 550;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fold-block[open] > .fold-summary .fold-hint {
  display: none;
}
.fold-caret {
  flex-shrink: 0;
  width: 7px;
  height: 7px;
  margin-left: auto;
  border-right: 1.5px solid var(--muted);
  border-bottom: 1.5px solid var(--muted);
  transform: rotate(45deg);
  transition: transform 0.15s var(--ease);
  opacity: 0.75;
}
.fold-block[open] > .fold-summary .fold-caret {
  transform: rotate(-135deg);
  margin-top: 3px;
}
.ai-plan-list {
  list-style: none;
  margin: 0;
  padding: 0 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ai-plan-list li {
  font-size: 13px;
  line-height: 1.45;
  color: var(--ink);
}
.ai-plan-list em {
  font-style: normal;
  font-weight: 700;
  color: var(--muted);
  margin-right: 8px;
  font-size: 12px;
}
.summary-panel {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 2px;
}
.summary-block {
  padding: 0;
  border-radius: 12px;
  border: 0;
  background: var(--surface-2);
  min-width: 0;
}
.summary-block .summary-text {
  margin: 0;
  padding: 0 14px 14px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ink);
  white-space: pre-wrap;
  word-break: break-word;
}
.summary-text.empty {
  color: var(--muted);
}
.continuity-dialog :deep(.el-dialog) {
  border-radius: 18px;
  overflow: hidden;
  background: var(--surface);
  box-shadow: 0 24px 64px color-mix(in srgb, var(--ink) 16%, transparent);
}
.continuity-dialog :deep(.el-dialog__header) {
  margin: 0;
  padding: 20px 22px 0;
}
.continuity-dialog :deep(.el-dialog__body) {
  padding: 14px 22px 8px;
}
.continuity-dialog :deep(.el-dialog__footer) {
  padding: 8px 22px 18px;
}
.cd-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cd-kicker {
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
}
.cd-title {
  font-size: 20px;
  font-weight: 780;
  letter-spacing: -0.03em;
  color: var(--ink);
}
.cd-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.cd-hero {
  padding: 16px 16px 14px;
  border-radius: var(--radius-lg);
  border: 1px solid color-mix(in srgb, var(--line) 60%, var(--accent) 40%);
  background:
    radial-gradient(120% 80% at 0% 0%, color-mix(in srgb, var(--accent-soft) 85%, transparent), transparent 55%),
    var(--surface-2);
}
.cd-hero-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}
.cd-hero-label {
  font-size: 12px;
  font-weight: 750;
  color: var(--muted);
}
.cd-link {
  border: none;
  background: transparent;
  padding: 0;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  color: var(--accent);
  cursor: pointer;
}
.cd-link:hover {
  text-decoration: underline;
}
.cd-hero-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.65;
  color: var(--ink);
  white-space: pre-wrap;
}
.cd-hero-empty {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--muted);
}
.cd-hero-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 14px;
}
.cd-stat {
  padding: 10px 12px;
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--surface) 80%, transparent);
  border: 1px solid color-mix(in srgb, var(--line) 75%, transparent);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cd-stat strong {
  font-size: 20px;
  font-weight: 780;
  letter-spacing: -0.03em;
  color: var(--ink);
  line-height: 1.1;
}
.cd-stat span {
  font-size: 11px;
  font-weight: 650;
  color: var(--muted);
}
.cd-section {
  padding: 14px 14px 12px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--line);
  background: var(--surface);
}
.cd-section-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 12px;
  font-weight: 750;
  color: var(--muted);
}
.cd-section-head em {
  font-style: normal;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: var(--radius-sm);
  display: inline-grid;
  place-items: center;
  font-size: 11px;
  font-weight: 750;
  color: var(--accent-ink);
  background: var(--accent);
}
.cd-hooks-scroll {
  min-height: 0;
}
.cd-hooks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cd-hook {
  display: grid;
  grid-template-columns: 10px 1fr;
  gap: 10px;
  align-items: start;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: var(--surface-2);
  border: 1px solid color-mix(in srgb, var(--line) 85%, transparent);
}
.cd-hook-mark {
  width: 8px;
  height: 8px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent);
}
.cd-hook-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ink);
}
.cd-hook-from {
  display: inline-block;
  margin-top: 4px;
  font-size: 11px;
  font-weight: 650;
  color: var(--muted);
}
.cd-empty-block {
  padding: 18px 12px;
  text-align: center;
  border-radius: var(--radius);
  background: var(--surface-2);
}
.cd-empty-block p {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 700;
  color: var(--ink);
}
.cd-empty-block span {
  font-size: 12px;
  color: var(--muted);
}
.cd-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  width: 100%;
}
@media (max-width: 720px) {
  .summary-panel {
    grid-template-columns: 1fr;
  }
}
.title-input {
  flex: 1;
}
.title-input :deep(.el-input__wrapper) {
  box-shadow: none !important;
  background: transparent;
  padding-left: 2px;
}
.title-input :deep(.el-input__inner) {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 500;
  letter-spacing: -0.03em;
  color: var(--ink);
}
.title-display {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  padding: 4px 2px;
  margin: 0;
  text-align: left;
  font: inherit;
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 500;
  letter-spacing: -0.03em;
  line-height: 1.3;
  color: var(--ink);
  cursor: text;
  border-radius: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.title-display:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent-soft) 55%, transparent);
}
.title-display:disabled {
  cursor: default;
  opacity: 0.85;
}
.title-copy {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition:
    color 0.15s var(--ease),
    background 0.15s var(--ease),
    border-color 0.15s var(--ease);
}
.title-copy:hover:not(:disabled) {
  color: var(--accent-2, var(--accent));
  background: var(--accent-soft);
  border-color: color-mix(in srgb, var(--accent) 28%, transparent);
}
.title-copy:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.editor-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin-bottom: 0;
}
@media (max-width: 960px) {
  .write-page {
    overflow: hidden;
  }
  .chapter-workspace {
    grid-template-columns: 1fr;
    height: auto;
    min-height: 0;
  }
  .chapter-sider {
    max-height: 42vh;
    border-right: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--line) 75%, transparent);
  }
  .chapter-pane {
    min-height: 60vh;
    padding-left: 8px;
  }
  .chapter-list.compact {
    max-height: 140px;
  }
  .char-table-wrap {
    min-height: 50vh;
  }
}
.form-section-label {
  margin: 4px 0 6px;
  font-size: 13px;
  font-weight: 700;
  color: var(--ink);
}
.form-ready-tip {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--warn);
}
.form-ready-tip.ok {
  color: var(--ok);
}
.form-prompt-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.role-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.role-chip {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  text-align: left;
  border: 1px solid var(--line);
  background: var(--surface);
  border-radius: var(--radius);
  padding: 8px 10px;
  min-width: 112px;
  cursor: pointer;
  font-family: inherit;
  color: var(--ink);
}
.role-chip strong {
  font-size: 13px;
}
.role-chip span {
  font-size: 11px;
  color: var(--muted);
  font-weight: 500;
}
.role-chip.on {
  border-color: var(--accent);
  background: var(--accent-soft);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent);
}
.role-chip.good.on {
  border-color: color-mix(in srgb, var(--ok) 45%, var(--line));
  background: color-mix(in srgb, var(--ok) 12%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--ok) 22%, transparent);
}
.role-chip.evil.on {
  border-color: color-mix(in srgb, var(--danger) 45%, var(--line));
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--danger) 22%, transparent);
}
.role-chip.neutral.on {
  border-color: color-mix(in srgb, var(--warn) 45%, var(--line));
  background: color-mix(in srgb, var(--warn) 12%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--warn) 22%, transparent);
}
</style>

<style>
/* append-to-body：本章规划抽屉 */
.ref-drawer.el-drawer {
  background: var(--studio-bg) !important;
  color: var(--studio-ink);
  box-shadow: none;
  border-left: 1px solid var(--studio-line-strong);
}
.ref-drawer .el-drawer__header {
  margin-bottom: 0 !important;
  padding: 16px 16px 12px !important;
  border-bottom: 1px solid var(--studio-line-strong);
  color: var(--studio-ink) !important;
}
.ref-drawer .el-drawer__close-btn {
  color: var(--studio-muted) !important;
}
.ref-drawer .el-drawer__close-btn:hover {
  color: #fff !important;
}
.ref-drawer .el-drawer__body {
  padding: 0 0 16px !important;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background: var(--studio-bg);
}
.ref-drawer .el-overlay {
  background: rgba(0, 0, 0, 0.55) !important;
}
</style>
