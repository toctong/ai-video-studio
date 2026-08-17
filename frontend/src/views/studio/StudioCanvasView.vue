<template>
  <div class="canvas-shell">
    <!-- 资产拖入仍用此面板；不挂左轨，仅在点选资产时展开 -->
    <CanvasNodePalette
      ref="paletteRef"
      hide-toggle
      :catalog="catalog"
      :workflow-id="workflowId"
      :project-id="projectId"
      @add="addNodeFromPalette"
      @open-assets="router.push('/assets')"
    />

    <div class="stage">
      <div class="stage-top">
        <div class="top-left">
          <button type="button" class="back" title="返回项目" @click="router.push('/productions')">
            <IconBack :size="18" />
          </button>
          <input v-model="name" class="wf-name" @input="markDirty" />
          <span v-if="dirty" class="meta-chip warn">未保存</span>
          <span v-if="scriptGenLoading" class="meta-chip gen">脚本生成中</span>
        </div>
        <div class="top-right">
          <span v-if="liveRunCount > 0" class="meta-chip gen" :title="`${liveRunCount} 个任务进行中`">
            {{ liveRunCount }} 任务
          </span>
          <button
            v-if="liveRunCount > 0 || textGenRunning || agentLive.streaming"
            type="button"
            class="top-stop"
            :title="liveRunCount > 1 ? `终止全部 ${liveRunCount} 个任务` : '终止生成'"
            aria-label="终止生成"
            @click="cancelActiveRun"
          >
            <span class="stop-sq" aria-hidden="true" />
            <span>{{ liveRunCount > 1 ? `终止全部` : '终止' }}</span>
          </button>
          <button
            type="button"
            class="top-log"
            :class="[{ on: runModalOpen }, activeRun?.status || '']"
            title="运行日志"
            aria-label="运行日志"
            @click="openRunModal()"
          >
            <UiIcon name="file-text" :size="16" />
            <span
              v-if="activeRun || liveRunCount > 0"
              class="log-dot"
              :class="activeRun?.status || 'active'"
            />
          </button>
          <button
            type="button"
            class="top-search"
            :class="{ on: searchOpen }"
            :title="isMac ? '搜索画布 ⌘K' : '搜索画布 Ctrl+K'"
            aria-label="搜索画布"
            @click="openCanvasSearch"
          >
            <UiIcon name="search" :size="16" />
          </button>
          <button
            type="button"
            class="btn-chat"
            :class="{ on: chatOpen }"
            title="对话"
            @click="toggleChat"
          >
            <UiIcon name="message" :size="15" />
            <span>对话</span>
          </button>
          <div class="export-wrap">
            <button
              type="button"
              class="icon-ghost"
              title="更多"
              @click="moreMenuOpen = !moreMenuOpen"
            >
              <UiIcon name="more-horizontal" :size="18" />
            </button>
            <div v-if="moreMenuOpen" class="export-menu" @mousedown.stop>
              <button
                type="button"
                :disabled="publishing"
                @click="moreMenuOpen = false; publishCurrent()"
              >
                {{ publishing ? '发布中…' : '发布到发现' }}
              </button>
              <div class="menu-sep" role="separator" />
              <button type="button" @click="moreMenuOpen = false; triggerImportJson()">导入</button>
              <button type="button" @click="moreMenuOpen = false; exportAiVideoStudioJson()">
                导出 AIGC 视频工厂 JSON
              </button>
              <button type="button" @click="moreMenuOpen = false; exportComfyJson()">
                导出 ComfyUI JSON
              </button>
              <button type="button" @click="moreMenuOpen = false; exportFullNodePack()">
                导出整图节点包
              </button>
              <button
                type="button"
                :disabled="!selectedNodeIds.length"
                @click="moreMenuOpen = false; exportSelectionPack()"
              >
                导出选中节点包
              </button>
            </div>
          </div>
          <input
            ref="importJsonInput"
            type="file"
            accept="application/json,.json"
            hidden
            @change="onImportJsonFile"
          />
        </div>
      </div>

      <div
        class="flow-wrap"
        :class="{
          'space-pan': spacePan || panMode,
          'hide-edges': hideEdges,
          booting: bootLoading,
          genning: scriptGenLoading,
        }"
        tabindex="0"
        @keydown="onKeydown"
        @keyup="onKeyup"
        @pointerdown.capture="onFlowGroupPointerDownCapture"
        @mousedown="onFlowWrapMouseDown"
        @dragover.prevent
        @drop="onPaletteDrop"
      >
        <VueFlow
          id="studio-canvas"
          :nodes="nodes"
          :edges="edges"
          :node-types="nodeTypes"
          :default-viewport="defaultViewport"
          :min-zoom="0.2"
          :max-zoom="2.5"
          :default-edge-options="defaultEdgeOptions"
          :delete-key-code="null"
          :selection-key-code="spacePan || panMode ? null : true"
          :pan-activation-key-code="'Space'"
          :pan-on-drag="spacePan || panMode"
          :selection-mode="SelectionMode.Partial"
          :multi-selection-key-code="multiSelectionKeyCode"
          :is-valid-connection="checkConnection"
          :connection-radius="72"
          :connect-on-click="false"
          :elevate-edges-on-select="false"
          @nodes-change="onNodesChange"
          @edges-change="onEdgesChange"
          @connect="onConnect"
          @connect-start="onConnectStart"
          @connect-end="onConnectEnd"
          @node-click="onNodeClick"
          @node-double-click="onNodeDoubleClick"
          @pane-click="onPaneClick"
          @pane-context-menu="onPaneContextMenu"
          @node-context-menu="onNodeContextMenu"
          @edge-context-menu="onEdgeContextMenu"
          @node-drag-start="onNodeDragStart"
          @node-drag="onNodeDrag"
          @node-drag-stop="onNodeDragStop"
          @selection-end="onSelectionEnd"
          @move-start="onCanvasMoveStart"
          @move-end="onCanvasMoveEnd"
        >
          <MiniMap pannable zoomable position="bottom-left" />
          <CanvasAlignGuides :horizontal="alignGuideH" :vertical="alignGuideV" />
        </VueFlow>

        <CanvasToolRail
          :library-open="libraryOpen"
          :history-open="historyOpen"
          @library="toggleLibrary"
          @history="toggleHistory"
        />

        <div v-if="bootLoading" class="boot-mask" aria-busy="true" aria-label="画布加载中">
          <span class="boot-spin" aria-hidden="true" />
          <em>画布加载中…</em>
        </div>

        <div
          v-else-if="scriptGenLoading"
          class="gen-mask"
          aria-busy="true"
          aria-label="脚本生成中"
        >
          <span class="boot-spin" aria-hidden="true" />
          <em>{{ scriptGenStore.status || '正在生成分镜脚本…' }}</em>
          <p>可关闭本工作流，生成会在后台继续并写入画布</p>
        </div>

        <div v-if="!bootLoading && !workflowNodeCount" class="empty-canvas">
          <CanvasEmptySkills @pick="onEmptySkillPick" />
        </div>

        <CanvasDockBar
          ref="dockRef"
          :zoom="viewportZoom"
          :pan-mode="panMode"
          :hide-edges="hideEdges"
          :can-undo="undoStack.length > 0"
          :can-redo="redoStack.length > 0"
          @fit="fitCanvas"
          @zoom-in="zoomInCanvas"
          @zoom-out="zoomOutCanvas"
          @undo="undo"
          @redo="redo"
          @update:pan-mode="panMode = $event"
          @update:hide-edges="hideEdges = $event"
        />
      </div>
    </div>

    <CanvasMediaSheet
      ref="mediaSheetCompRef"
      :open="mediaSheetOpen"
      :node-id="selectedId || ''"
      :data="isAiMediaSelected ? selectedData : null"
      :running="mediaSheetRunning"
      :model-options="modelOptions"
      :refs="selectedMediaRefs"
      :text-refs="mediaSheetTextRefs"
      :anchor="mediaSheetAnchor"
      @close="closeMediaSheet"
      @run="runSelectedNode"
      @cancel="cancelSelectedNodeRun"
      @pick-asset="onInspectorPickAsset"
      @update-param="setParam"
      @update-label="setLabel"
      @remove-ref="removeMediaSheetRef"
      @layout="scheduleMediaSheetAnchor"
    />

    <CanvasAgentSheet
      ref="agentSheetCompRef"
      :open="agentSheetOpen && isAgentSelected"
      :data="isAgentSelected ? selectedData : null"
      :running="mediaSheetRunning"
      :streaming="agentLive.streaming && agentLive.nodeId === selectedId"
      :live-text="agentLive.nodeId === selectedId ? agentLive.text : ''"
      :user-message="agentLive.nodeId === selectedId ? agentLive.userMessage : ''"
      :phase="agentLive.nodeId === selectedId ? agentLive.phase : 'idle'"
      :steps="agentLive.nodeId === selectedId ? agentLive.steps : []"
      :steps-open="agentLive.stepsOpen"
      :refs="agentSheetRefs"
      :canvas-cites="agentCanvasCites"
      :project-cites="agentProjectCites"
      :anchor="agentSheetAnchor"
      @close="closeAgentSheet"
      @run="runSelectedNode"
      @cancel="cancelSelectedNodeRun"
      @restart="onAgentRestart"
      @ask="onAgentAsk"
      @manage-skills="onAgentManageSkills"
      @cite-item="onAgentCiteItem"
      @toggle-steps="agentLive.stepsOpen = !agentLive.stepsOpen"
      @refresh-refs="refreshAgentRefs"
      @pick-ref="onAgentPickRef"
      @remove-ref="removeAgentRef"
      @update-param="onAgentUpdateParam"
      @update-label="setLabel"
      @a2ui-action="onAgentA2uiAction"
      @layout="scheduleAgentSheetAnchor"
    />

    <CanvasImageReplaceModal
      :open="imageReplaceOpen"
      :project-id="projectId"
      :workflow-id="workflowId"
      :workflow-name="name"
      :canvas-nodes="imageReplaceCanvasNodes"
      @close="onImageReplaceClose"
      @apply="onImageReplaceApply"
    />

    <CanvasImageDetailModal
      :open="imageDetailOpen"
      :url="imageDetail.url"
      :model="imageDetail.model"
      :aspect="imageDetail.aspect"
      :prompt="imageDetail.prompt"
      :generated-at="imageDetail.generatedAt"
      :file-name="imageDetail.fileName"
      @close="onImageDetailClose"
      @use-prompt="onImageDetailUsePrompt"
    />

    <CanvasTextSheet
      ref="textSheetCompRef"
      :open="textSheetOpen && isTextSelected"
      :prompt="textGenPrompt"
      :model="textGenModel"
      :mode="textGenMode"
      :running="textGenRunning"
      :model-options="chatModelOptions"
      :refs="textSheetIncomingRefs"
      :anchor="textSheetAnchor"
      @update:prompt="textGenPrompt = $event"
      @update:model="textGenModel = $event"
      @update:mode="textGenMode = $event"
      @run="void runTextGenerate()"
      @edit="openTextEditForSelected"
      @pick-asset="onInspectorPickAsset"
      @remove-ref="removeTextSheetRef"
      @layout="scheduleTextSheetAnchor"
    />

    <CanvasTextEditModal
      :open="textEditOpen"
      :value="textEditValue"
      @close="onTextEditClose"
      @save="onTextEditSave"
    />

    <CanvasTextReplaceModal
      :open="textReplaceOpen"
      :project-id="projectId"
      :workflow-id="workflowId"
      :canvas-nodes="textReplaceCanvasNodes"
      @close="onTextReplaceClose"
      @apply="onTextReplaceApply"
    />

    <CanvasContextMenu
      :open="menu.open"
      :x="menu.x"
      :y="menu.y"
      :mode="menu.mode"
      :show-detail="menuShowDetail"
      :node-id="menu.nodeId"
      @close="closeMenu"
      @detail="onMenuDetail"
      @duplicate="onMenuDuplicate"
      @clone-empty="onMenuCloneEmpty"
      @rerun="onMenuRerun"
      @delete="onMenuDelete"
    />

    <CanvasAddPalette
      :open="addPalette.open"
      :x="addPalette.x"
      :y="addPalette.y"
      :can-paste="!!nodeClipboard"
      @close="addPalette.open = false"
      @add="onAddPalettePick"
      @upload="void uploadMedia()"
      @fit="fitView({ padding: 0.2, duration: 280 })"
      @paste="onPasteClipboardNode"
      @plugins="goPluginLibrary"
      @audio-unsupported="ElMessage.info('当前版本暂无音频节点，可从素材库选用音频')"
    />

    <CanvasHistoryModal
      :open="historyOpen"
      :project-id="projectId"
      :workflow-id="workflowId"
      @close="historyOpen = false"
      @pick="onPickHistoryAsset"
    />

    <CanvasRunModal
      :open="runModalOpen"
      :run-id="runModalId"
      :workflow-id="workflowId"
      :live-run="activeRun"
      @close="runModalOpen = false"
      @update:run-id="onRunModalId"
      @refreshed="onRunModalRefreshed"
      @retried="onRunModalRetried"
    />

    <CanvasLibraryModal
      :open="libraryOpen"
      :project-id="projectId"
      :workflow-id="workflowId"
      :workflow-name="name"
      :initial-tab="libraryTab"
      :apply-mode="libraryApplyMode"
      @close="libraryOpen = false"
      @apply="onApplyLibrary"
      @pick="onPickHistoryAsset"
    />

    <CanvasSearchModal
      :open="searchOpen"
      :nodes="searchNodes"
      @close="searchOpen = false"
      @locate="onSearchLocate"
    />

    <CanvasChatPanel
      ref="chatPanelRef"
      :open="chatOpen"
      :production-id="productionId"
      :workflow-id="workflowId"
      :workflow-name="name"
      :project-id="projectId"
      :canvas-snapshot="chatCanvasSnapshot"
      @close="chatOpen = false"
      @action="onChatAction"
    />

    <CanvasScriptGenerator
      :open="scriptGenOpen"
      :style-label="scriptCtx.styleLabel"
      :style-brief="scriptCtx.styleBrief"
      :character-label="scriptCtx.characterLabel"
      :character-brief="scriptCtx.characterBrief"
      :shot-label="scriptCtx.shotLabel"
      :shot-brief="scriptCtx.shotBrief"
      :shot-id="scriptCtx.shotId"
      :category="scriptCtx.category"
      :sub-style="scriptCtx.subStyle"
      :tags="scriptCtx.tags"
      :initial-mode="scriptCtx.mode"
      :initial-prompt="scriptCtx.initialPrompt"
      :initial-duration-sec="scriptCtx.durationSec"
      @close="scriptGenOpen = false"
      @open-style="openLibraryFromScript('style')"
      @open-character="openLibraryFromScript('character')"
      @open-shot="openLibraryFromScript('shot')"
      @confirm="onScriptGeneratorConfirm"
    />
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  markRaw,
  nextTick,
  onMounted,
  onUnmounted,
  provide,
  reactive,
  ref,
  watch,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus';
import {
  VueFlow,
  SelectionMode,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useVueFlow,
  type Connection,
  type EdgeChange,
  type EdgeMouseEvent,
  type NodeChange,
  type NodeDragEvent,
  type NodeMouseEvent,
} from '@vue-flow/core';
import { MiniMap } from '@vue-flow/minimap';
import IconBack from '@/components/IconBack.vue';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/minimap/dist/style.css';
import type { WorkflowNodeCatalogItem } from '@ai-video-studio/shared';
import {
  fetchNodeCatalog,
  fetchWorkflow,
  fetchWorkflowRuns,
  runWorkflow,
  cancelWorkflowRun,
  retryWorkflowRun,
  updateWorkflow,
  type WorkflowRunRow,
} from '@/api/workflows';
import { fetchProduction } from '@/api/productions';
import { publishToDiscover } from '@/api/discover';
import {
  comfyExportPackage,
  nodePackExportPackage,
  nodePackFromSelection,
  productionExportPackage,
  workflowExportPackage,
} from '@/utils/export-packages';
import { mergeNodePack, routeImportedJson } from '@/utils/import-workflow-json';
import { downloadJson, downloadUrl, downloadTextFile } from '@/utils/download';
import {
  GROUP_COLORS,
  WF_GROUP_TYPE,
  catalogMap,
  ensureMediaPipelineEdges,
  flowToGraph,
  graphToFlow,
  isWorkflowGroupNode,
  newNodeId,
  styleEdgeFromNodes,
} from '@/utils/workflow-flow';
import {
  explainConnectReject,
  findNodeIdAtClientPoint,
  normalizeConnection,
  resolveNodeDropConnection,
  type ConnectFromHandle,
} from '@/utils/workflow-connect';
import { DEFAULT_MEDIA_ASPECT } from '@/utils/node-spec';
import CanvasNodePalette from '@/components/studio/CanvasNodePalette.vue';
import CanvasMediaSheet from '@/components/studio/CanvasMediaSheet.vue';
import CanvasAlignGuides from '@/components/studio/CanvasAlignGuides.vue';
import CanvasAgentSheet, {
  type AgentCiteItem,
  type AgentRefChip,
} from '@/components/studio/CanvasAgentSheet.vue';
import api from '@/api';
import { getAlignHelperLines } from '@/utils/align-helper-lines';
import CanvasImageReplaceModal, {
  type ImageReplaceCanvasItem,
} from '@/components/studio/CanvasImageReplaceModal.vue';
import CanvasImageDetailModal from '@/components/studio/CanvasImageDetailModal.vue';
import CanvasTextSheet from '@/components/studio/CanvasTextSheet.vue';
import { buildDerivedImageNode, mediaUrlOfNode } from '@/utils/derive-image-node';
import { gridSplitDisplaySize, splitImageToGrid } from '@/utils/split-image-grid';
import CanvasTextEditModal from '@/components/studio/CanvasTextEditModal.vue';
import { htmlToPlainText } from '@/utils/html-to-plain';
import CanvasTextReplaceModal, {
  type TextReplaceCanvasItem,
} from '@/components/studio/CanvasTextReplaceModal.vue';
import CanvasContextMenu from '@/components/studio/CanvasContextMenu.vue';
import CanvasAddPalette from '@/components/studio/CanvasAddPalette.vue';
import { chatCompletion, chatCompletionStream } from '@/api/ai-chat';
import { agentA2uiStream, type AgentA2uiEvent } from '@/api/agent-a2ui';
import { findChatSkill } from '@/utils/skill-catalog';
import type { AgentA2uiActionPayload } from '@/composables/useAgentA2ui';
import { useCanvasAutosave } from '@/composables/useCanvasAutosave';
import { useCanvasLiveRuns } from '@/composables/useCanvasLiveRuns';
import CanvasDockBar from '@/components/studio/CanvasDockBar.vue';
import CanvasToolRail from '@/components/studio/CanvasToolRail.vue';
import CanvasEmptySkills, {
  type EmptySkillChild,
} from '@/components/studio/CanvasEmptySkills.vue';
import CanvasSearchModal from '@/components/studio/CanvasSearchModal.vue';
import CanvasChatPanel from '@/components/studio/CanvasChatPanel.vue';
import CanvasHistoryModal, {
  type HistoryAsset,
} from '@/components/studio/CanvasHistoryModal.vue';
import CanvasRunModal from '@/components/studio/CanvasRunModal.vue';
import CanvasLibraryModal from '@/components/studio/CanvasLibraryModal.vue';
import CanvasScriptGenerator, {
  type ScriptGenMode,
} from '@/components/studio/CanvasScriptGenerator.vue';
import type { LibraryApplyMode } from '@/components/studio/library-apply';
import type { LibraryKind } from '@/libraries';
import UiIcon from '@/components/icons/UiIcon.vue';
import WorkflowFlowNode, {
  type WorkflowFlowNodeData,
} from '@/components/studio/WorkflowFlowNode.vue';
import WorkflowGroupNode from '@/components/studio/WorkflowGroupNode.vue';
import { resolveAssetProjectId } from '@/constants/studio';
import { useAiSettings } from '@/composables/useAiSettings';
import { useScriptGenStore } from '@/stores/script-gen';
import {
  extractCanvasImageItems,
  extractVideoPrompts,
  type CanvasChatSnapshot,
} from '@/stores/studio-chat';
import { buildCanvasContextPrompt, type ChatAction } from '@/utils/studio-chat-actions';
import { parseScriptShots } from '@/utils/script-gen-layout';
import {
  buildStudioTextGenMessages,
  isDefaultTextNodeLabel,
  sanitizeStudioTextPrompt,
  studioTextPromptModeMeta,
  type StudioTextPromptMode,
} from '@/utils/studio-text-prompt';
import {
  ensureLocalImageUrl,
  isCanvasSafeImageUrl,
  pickLocalFile,
  uploadProjectAsset,
} from '@/utils/upload-asset';

const route = useRoute();
const router = useRouter();
const { screenToFlowCoordinate, updateNodeInternals, fitView, zoomIn, zoomOut, setViewport, viewport, userSelectionActive, userSelectionRect } =
  useVueFlow({ id: 'studio-canvas' });
const { modelsOf, ensureAiSettings } = useAiSettings();
const scriptGenStore = useScriptGenStore();
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');
/** 按住 Ctrl（Mac 为 ⌘）才可框选；点击多选同一修饰键 */
/** 多选修饰键；框选用 selection-key-code=true（vue-flow 校验不再接受字符串） */
const multiSelectionKeyCode = isMac ? 'Meta' : 'Control';
const spacePan = ref(false);
/** 底坞持久拖动模式（空格仍为临时拖动） */
const panMode = ref(false);
const hideEdges = ref(false);
const paletteOpen = ref(false);
const moreMenuOpen = ref(false);
const searchOpen = ref(false);
const chatOpen = ref(false);
const chatPanelRef = ref<{
  sendNow: (text: string) => Promise<void>;
  bindCurrentWorkflow: () => void;
} | null>(null);

/** 注入工作流对话的画布只读快照 */
const chatCanvasSnapshot = computed((): CanvasChatSnapshot => {
  const list = nodes.value.filter((n: any) => n && !isWorkflowGroupNode(n));
  const nodeRows = list.map((n: any) => {
    const data = (n.data || {}) as WorkflowFlowNodeData;
    const prompt = String(
      data.params?.prompt || data.params?.value || data.previewText || '',
    )
      .replace(/\s+/g, ' ')
      .trim();
    return {
      id: String(n.id),
      type: String(data.nodeType || n.type || ''),
      label: String(data.label || data.catalog?.title || '').trim(),
      prompt: prompt || undefined,
      status: data.status ? String(data.status) : undefined,
    };
  });
  const edgeRows = (edges.value as any[])
    .filter((e) => e?.source && e?.target)
    .map((e) => ({ source: String(e.source), target: String(e.target) }));
  const selectedIds = list
    .filter((n: any) => n.selected)
    .map((n: any) => String(n.id));
  if (selectedId.value && !selectedIds.includes(selectedId.value)) {
    selectedIds.unshift(selectedId.value);
  }
  return {
    workflowId: workflowId.value,
    workflowName: name.value,
    selectedIds,
    nodes: nodeRows,
    edges: edgeRows,
  };
});

function setSpacePan(on: boolean) {
  if (spacePan.value === on) return;
  spacePan.value = on;
  if (on) {
    // 空格拖动画布时立刻取消框选，避免出现选区矩形
    userSelectionActive.value = false;
    userSelectionRect.value = null;
  }
}

/** 画布默认 / 每次进入：100% */
const DEFAULT_ZOOM = 1;
const defaultViewport = { x: 0, y: 0, zoom: DEFAULT_ZOOM };
/** boot 时若图里存了视口，优先恢复（单节点 fitView 会把挪过的位置「看起来」冲掉） */
let pendingBootViewport: { x: number; y: number; zoom: number } | null = null;
/** 本轮 settle 已用存档视口恢复，勿再 fitView */
let bootViewportRestored = false;

function readFlowViewport() {
  const vp = viewport.value;
  if (!vp) return null;
  const x = Number(vp.x);
  const y = Number(vp.y);
  const zoom = Number(vp.zoom);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom) || zoom <= 0) return null;
  return { x, y, zoom };
}

function normalizeSavedViewport(raw: unknown): { x: number; y: number; zoom: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as { x?: unknown; y?: unknown; zoom?: unknown };
  const x = Number(v.x);
  const y = Number(v.y);
  const zoom = Number(v.zoom);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom) || zoom <= 0) return null;
  return { x, y, zoom: Math.min(2.5, Math.max(0.2, zoom)) };
}

const workflowId = computed(() => String(route.params.workflowId || ''));
const productionId = computed(() => String(route.query.productionId || '').trim());
const productionLabel = ref('');
const bootLoading = ref(true);
const suppressDirty = ref(true);
const saving = ref(false);
/** Agent 前端流式（不走 workflow run 轮询，过程在弹层/卡片可见） */
export type AgentRunStep = {
  id: string;
  label: string;
  status: 'done' | 'active' | 'pending';
};

const agentLive = reactive({
  nodeId: '',
  streaming: false,
  text: '',
  userMessage: '',
  phase: 'idle' as 'idle' | 'understanding' | 'generating' | 'done' | 'failed',
  steps: [] as AgentRunStep[],
  stepsOpen: true,
  sessionId: '',
});
let agentAbort: AbortController | null = null;
/** 流式增量写回卡片时节流，避免每个 token 整表 map */
let agentPreviewRaf = 0;
const agentSheetCompRef = ref<{
  insertCite?: (opts: {
    label: string;
    id?: string;
    url?: string;
    mediaKind?: 'image' | 'video' | 'text';
  }) => void;
  focus?: () => void;
  ingestA2ui?: (messages: Record<string, unknown>[]) => string;
  patchA2ui?: (messages: Record<string, unknown>[]) => string;
  clearSurfaces?: () => void;
  resetSession?: () => void;
  getSheetRect?: () => DOMRect | null;
} | null>(null);
const mediaSheetCompRef = ref<{ getSheetRect?: () => DOMRect | null } | null>(null);
const textSheetCompRef = ref<{ getSheetRect?: () => DOMRect | null } | null>(null);

provide('studioAgentLive', agentLive);

function resetAgentLive(partial?: Partial<typeof agentLive>) {
  agentLive.nodeId = partial?.nodeId ?? '';
  agentLive.streaming = partial?.streaming ?? false;
  agentLive.text = partial?.text ?? '';
  agentLive.userMessage = partial?.userMessage ?? '';
  agentLive.phase = partial?.phase ?? 'idle';
  agentLive.steps = partial?.steps ?? [];
  agentLive.stepsOpen = partial?.stepsOpen ?? true;
  agentLive.sessionId = partial?.sessionId ?? '';
}

/** 把当前对话写入节点，刷新后可恢复 */
function persistAgentTranscript(
  nodeId: string,
  opts?: { a2uiMessages?: Record<string, unknown>[] | null; saveNow?: boolean },
) {
  if (!nodeId) return;
  const n = nodes.value.find((x: any) => x.id === nodeId);
  if (!n || isWorkflowGroupNode(n)) return;
  const data = (n.data || {}) as WorkflowFlowNodeData;
  const params = { ...(data.params || {}) };
  params.agentUserMessage = agentLive.userMessage || '';
  params.agentSessionId = agentLive.sessionId || '';
  params.agentPhase = agentLive.phase || 'idle';
  try {
    params.agentSteps = JSON.stringify(agentLive.steps || []);
  } catch {
    params.agentSteps = '[]';
  }
  if (opts && 'a2uiMessages' in opts) {
    if (opts.a2uiMessages?.length) {
      try {
        params.agentA2uiMessages = JSON.stringify(opts.a2uiMessages);
      } catch {
        params.agentA2uiMessages = '';
      }
    } else {
      params.agentA2uiMessages = '';
    }
  }
  const text = String(agentLive.text || data.previewText || '').trim();
  n.data = {
    ...data,
    params,
    previewText: text || data.previewText || '',
  };
  markDirty();
  if (opts?.saveNow) void save({ force: true });
}

function clearPersistedAgentTranscript(params: Record<string, any>) {
  params.agentUserMessage = '';
  params.agentSessionId = '';
  params.agentPhase = '';
  params.agentSteps = '';
  params.agentA2uiMessages = '';
}

function parseAgentSteps(raw: unknown): AgentRunStep[] {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw;
    if (!Array.isArray(v)) return [];
    return v
      .map((s: any) => ({
        id: String(s?.id || ''),
        label: String(s?.label || ''),
        status: (['pending', 'active', 'done', 'failed'].includes(String(s?.status))
          ? String(s.status)
          : 'pending') as AgentRunStep['status'],
      }))
      .filter((s) => s.id);
  } catch {
    return [];
  }
}

function parseAgentA2uiMessages(raw: unknown): Record<string, unknown>[] {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw;
    return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
  } catch {
    return [];
  }
}

/** 从节点恢复对话（刷新后打开弹层） */
function hydrateAgentLiveFromNode(nodeId: string) {
  if (!nodeId) return;
  if (agentLive.streaming && agentLive.nodeId === nodeId) return;

  const n = nodes.value.find((x: any) => x.id === nodeId);
  if (!n || isWorkflowGroupNode(n)) return;
  const data = (n.data || {}) as WorkflowFlowNodeData;
  const params = data.params || {};
  const userMessage = String(params.agentUserMessage || '').trim();
  const text = String(data.previewText || agentLive.text || '').trim();
  const sessionId = String(params.agentSessionId || '').trim();
  const steps = parseAgentSteps(params.agentSteps);
  const phaseRaw = String(params.agentPhase || '').trim();
  const phase =
    phaseRaw === 'understanding' ||
    phaseRaw === 'generating' ||
    phaseRaw === 'done' ||
    phaseRaw === 'failed'
      ? phaseRaw
      : text || userMessage || steps.length
        ? 'done'
        : 'idle';

  // 无任何可恢复内容时，若当前已是该节点空态则不动
  if (!userMessage && !text && !steps.length && !sessionId) {
    if (agentLive.nodeId !== nodeId) {
      resetAgentLive({ nodeId, stepsOpen: true });
    }
    agentSheetCompRef.value?.clearSurfaces?.();
    return;
  }

  resetAgentLive({
    nodeId,
    streaming: false,
    text,
    userMessage,
    phase,
    steps,
    sessionId,
    stepsOpen: true,
  });

  const a2uiMessages = parseAgentA2uiMessages(params.agentA2uiMessages);
  void nextTick(() => {
    if (agentLive.nodeId !== nodeId || agentLive.streaming) return;
    agentSheetCompRef.value?.clearSurfaces?.();
    if (a2uiMessages.length) {
      agentSheetCompRef.value?.ingestA2ui?.(a2uiMessages);
    }
  });
}

function markAgentStep(id: string, status: AgentRunStep['status'], label?: string) {
  const i = agentLive.steps.findIndex((s) => s.id === id);
  if (i < 0) return;
  const cur = agentLive.steps[i];
  agentLive.steps[i] = {
    ...cur,
    status,
    ...(label ? { label } : {}),
  };
}

function buildAgentRunSteps(opts: {
  skillName?: string;
  hasRefs?: boolean;
  hasCanvas?: boolean;
}): AgentRunStep[] {
  const steps: AgentRunStep[] = [
    { id: 'understand', label: '正在理解您的请求', status: 'pending' },
  ];
  if (opts.skillName) {
    steps.push({
      id: 'load-skill',
      label: `我来读取「${opts.skillName}」技能内容，并加载画布上下文`,
      status: 'pending',
    });
    steps.push({
      id: 'skill-ready',
      label: `技能已加载: ${opts.skillName}`,
      status: 'pending',
    });
  } else {
    steps.push({
      id: 'load-ctx',
      label: '正在加载画布上下文与参考素材',
      status: 'pending',
    });
  }
  if (opts.hasRefs) {
    steps.push({
      id: 'refs',
      label: '已关联参考素材',
      status: 'pending',
    });
  }
  steps.push({
    id: 'generate',
    label: '正在生成回复…',
    status: 'pending',
  });
  steps.push({
    id: 'finish',
    label: '整理输出结果',
    status: 'pending',
  });
  return steps;
}
const retryingRun = ref(false);
const uploading = ref(false);
const dirty = ref(false);
const { markDirty, clearAutoSaveTimer } = useCanvasAutosave({
  dirty,
  bootLoading,
  suppressDirty,
  isBlocked: () => scriptGenStore.isRunningFor(workflowId.value),
  save: () => save(),
  delayMs: 900,
});
const historyOpen = ref(false);
const runModalOpen = ref(false);
const runModalId = ref('');
const mediaSheetOpen = ref(false);
const agentSheetOpen = ref(false);
/** 拖动节点时的对齐辅助线（flow 坐标） */
const alignGuideH = ref<number | undefined>(undefined);
const alignGuideV = ref<number | undefined>(undefined);
const agentManualRefs = ref<AgentRefChip[]>([]);
const textSheetOpen = ref(false);
const textEditOpen = ref(false);
const textReplaceOpen = ref(false);
const textActionNodeId = ref('');
const imageReplaceOpen = ref(false);
const imageDetailOpen = ref(false);
const imageActionNodeId = ref('');
const gridSplitSession = ref<{ nodeId: string; rows: number; cols: number } | null>(null);
const textGenPrompt = ref('');
const textGenModel = ref('');
const textGenMode = ref<StudioTextPromptMode>('general');
const textGenRunning = ref(false);
/** 下一次拖入资产时，写入 referenceImage（生图/视频） */
const pendingRefPick = ref(false);
/** 参考挑选偏好：image / video（全能参考） */
const pendingRefMediaKind = ref<'image' | 'video'>('image');
/** 下一次拖入资产时，优先填入该节点（空输入节点点「拖入资产」） */
const pendingFillNodeId = ref('');
const libraryOpen = ref(false);
/** 有值时打开素材库会钻入对应文件夹；左轨打开则为空，停在根列表 */
const libraryTab = ref<LibraryKind | undefined>();
const libraryApplyMode = ref<LibraryApplyMode>('auto');
/** 资产桶：优先工作流/制作单真实 projectId，否则平台桶 */
const workflowProjectId = ref('');
const productionProjectId = ref('');
const projectId = computed(() =>
  resolveAssetProjectId({
    workflowProjectId: workflowProjectId.value,
    productionProjectId: productionProjectId.value,
  }),
);
const scriptGenOpen = ref(false);
const scriptCtx = reactive({
  styleLabel: '',
  styleBrief: '',
  characterLabel: '',
  characterBrief: '',
  shotLabel: '',
  shotBrief: '',
  shotId: '',
  category: '',
  subStyle: '',
  tags: [] as string[],
  durationSec: 10 as 10 | 15,
  mode: 'script' as ScriptGenMode,
  initialPrompt: '',
});
const scriptGenLoading = computed(() => scriptGenStore.isRunningFor(workflowId.value));
const dockRef = ref<{ closePanels: () => void } | null>(null);
const paletteRef = ref<{
  openAssets: (scope?: 'canvas' | 'global') => void;
  refreshAssets?: () => void;
  toggle?: () => boolean;
  isOpen?: () => boolean;
  collapse?: () => void;
  expand?: () => void;
} | null>(null);
const viewportZoom = computed(() => viewport.value?.zoom ?? DEFAULT_ZOOM);

const defaultEdgeOptions = {
  type: 'default',
  animated: false,
  style: { stroke: 'var(--line-hover)', strokeWidth: 2.25 },
};
const name = ref('');
const catalog = ref<WorkflowNodeCatalogItem[]>([]);
const nodes = ref<any[]>([]);
const edges = ref<any[]>([]);
const selectedId = ref('');
const dropPos = ref({ x: 160, y: 120 });
const activeRun = ref<WorkflowRunRow | null>(null);

const {
  liveRunFocus,
  liveNodeRuns,
  pendingCancelNodeIds,
  liveRunCount: workflowLiveRunCount,
  isTerminalRunStatus,
  stopWatch,
  stopAllWatches,
  stopPoll,
  trackLiveRun,
  untrackLiveRun,
  claimBusyNodesFromStates,
  startPoll,
  resetLiveRuns,
  isWatching,
} = useCanvasLiveRuns({
  activeRun,
  isNodeBusyStatus,
  applyNodeStates: (states, runId) => applyNodeStates(states as any, runId),
  finishNodeRun: (id, r) => finishNodeRun(id, r),
  toastCompleted: (states) => toastRunCompleted(states as any),
  notifyError: notifyRunError,
});

const liveRunCount = computed(
  () => workflowLiveRunCount.value + (agentLive.streaming ? 1 : 0),
);
/** 是否有任意画布任务在跑（兼容旧引用） */
const running = computed(() => liveRunCount.value > 0);

const undoStack = ref<string[]>([]);
const redoStack = ref<string[]>([]);
const MAX_UNDO = 40;

const menu = reactive({
  open: false,
  x: 0,
  y: 0,
  nodeId: '',
  mode: 'node' as 'node' | 'group',
});

const menuShowDetail = computed(() => {
  if (menu.mode === 'group' || !menu.nodeId) return false;
  const n = nodes.value.find((x: any) => x.id === menu.nodeId);
  const t = String(n?.data?.nodeType || '');
  return t === 'ai.image' || t === 'input.image' || t === 'output.preview';
});

const addPalette = reactive({
  open: false,
  x: undefined as number | undefined,
  y: undefined as number | undefined,
});

/** 右键「复制/克隆」只进剪贴板；「粘贴」才落到画布 */
type NodeClipboardPayload =
  | {
      kind: 'node';
      empty: boolean;
      nodeType: string;
      label?: string;
      params?: Record<string, unknown>;
      catalog?: unknown;
      previewImage?: string;
      previewVideo?: string;
      previewText?: string;
    }
  | {
      kind: 'group';
      title: string;
      width: number;
      height: number;
      color?: string;
      imagePort?: boolean;
      sourceImageId?: string;
      members: Array<{
        dx: number;
        dy: number;
        data: WorkflowFlowNodeData;
      }>;
      edges: Array<{
        from: number;
        to: number;
        sourceHandle: string;
        targetHandle: string;
      }>;
    };

const nodeClipboard = ref<NodeClipboardPayload | null>(null);

const membersTick = ref(0);

const nodeTypes: Record<string, any> = {
  workflow: markRaw(WorkflowFlowNode),
  [WF_GROUP_TYPE]: markRaw(WorkflowGroupNode),
};

const workflowNodeCount = computed(
  () => nodes.value.filter((n: any) => !isWorkflowGroupNode(n)).length,
);

provide('studioCanvasGroups', {
  membersTick,
  renameGroup(id: string, title: string) {
    pushUndo();
    const n = nodes.value.find((x: any) => x.id === id);
    if (!n || !isWorkflowGroupNode(n)) return;
    n.data = { ...(n.data || {}), title };
    markDirty();
  },
  memberCountOf(id: string) {
    const g = nodes.value.find((x: any) => x.id === id);
    if (!g || !isWorkflowGroupNode(g)) return 0;
    return membersOfGroup(g).length;
  },
  setGroupColor: (id: string, color: string) => setGroupColor(id, color),
  arrangeGroupMembers: (id: string, mode?: 'grid' | 'row' | 'column') =>
    arrangeGroupMembers(id, mode || 'grid'),
  batchDownloadGroup: (id: string) => batchDownloadGroup(id),
  ungroupById: (id: string) => ungroupByIds([id]),
});

const groupDragState = ref<{
  groupId: string;
  memberIds: string[];
  /** 拖拽开始时分组坐标；成员用绝对偏移跟随，避免增量 dx 与吸附不同步 */
  startGroupPos: { x: number; y: number };
  memberStarts: Record<string, { x: number; y: number }>;
} | null>(null);

const selectedData = computed((): WorkflowFlowNodeData | null => {
  const n = nodes.value.find((x: any) => x.id === selectedId.value);
  return (n?.data as WorkflowFlowNodeData) || null;
});

const isAiMediaSelected = computed(() => {
  const t = selectedData.value?.nodeType || '';
  return t === 'ai.image' || t === 'ai.video' || t === 'input.image' || t === 'output.preview';
});

const isAgentSelected = computed(() => selectedData.value?.nodeType === 'ai.chat');

const isTextSelected = computed(() => selectedData.value?.nodeType === 'input.text');

function mediaUrlFromNodeData(data?: WorkflowFlowNodeData | null) {
  if (!data) return '';
  return String(
    data.previewImage ||
      data.previewVideo ||
      data.params?.url ||
      data.params?.lastImage ||
      data.params?.lastVideo ||
      data.params?.referenceImage ||
      '',
  ).trim();
}

function isLikelyVideoUrl(url: string) {
  return (
    /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url) ||
    url.startsWith('data:video') ||
    /\/video\//i.test(url)
  );
}

/** 视频资产独立封面 JPG（无则空，勿用 mp4 冒充） */
function assetPosterUrl(asset: { meta?: Record<string, unknown> | null }) {
  const u = String((asset.meta as any)?.posterUrl || '').trim();
  if (!u || isLikelyVideoUrl(u)) return '';
  return u;
}

/** Agent 弹层参考：以画布连线为准（image→Agent），手动仅作临时补充 */
/** 上游节点（含分组展开）解析为媒体参考 chip */
function collectInboundMediaRefs(
  targetId: string,
  opts?: { max?: number; includeVideo?: boolean },
): Array<{ id: string; url: string; label?: string; fromGroupId?: string }> {
  const max = opts?.max ?? 9;
  const out: Array<{ id: string; url: string; label?: string; fromGroupId?: string }> = [];
  const seen = new Set<string>();

  const pushNode = (n: any, fromGroupId?: string) => {
    if (!n || seen.has(n.id) || out.length >= max) return;
    const data = (n.data || {}) as WorkflowFlowNodeData;
    const t = String(data.nodeType || '');
    if (t === 'input.text' || t === 'input.note' || t === 'ai.chat') return;
    const isVideoNode = t === 'ai.video' || t === 'input.video';
    if (isVideoNode && !opts?.includeVideo) {
      // 只取静帧预览；禁止把 mp4 当地址塞进参考图
      const still = String(
        data.previewImage || data.params?.lastImage || data.params?.referenceImage || '',
      ).trim();
      if (!still || isLikelyVideoUrl(still)) return;
      seen.add(n.id);
      out.push({
        id: n.id,
        url: still,
        label: data.label,
        ...(fromGroupId ? { fromGroupId } : {}),
      });
      return;
    }
    const url = mediaUrlFromNodeData(data);
    if (!url) return;
    if (!opts?.includeVideo && isLikelyVideoUrl(url)) return;
    seen.add(n.id);
    out.push({
      id: n.id,
      url,
      label: data.label,
      ...(fromGroupId ? { fromGroupId } : {}),
    });
  };

  for (const e of edges.value as any[]) {
    if (e.target !== targetId) continue;
    const th = String(e.targetHandle || '');
    const tgtNode = nodes.value.find((n: any) => n.id === targetId);
    const tgtType = String(tgtNode?.data?.nodeType || '');
    const textAcceptsImage = tgtType === 'input.text' && (!th || th === 'text');
    const videoAcceptsVideo =
      (tgtType === 'ai.video' || tgtType === 'input.video') && th === 'video';
    if (
      th &&
      th !== 'image' &&
      th !== 'endImage' &&
      th !== 'images' &&
      !textAcceptsImage &&
      !videoAcceptsVideo
    ) {
      continue;
    }
    const src = nodes.value.find((n: any) => n.id === e.source);
    if (!src) continue;
    if (isWorkflowGroupNode(src)) {
      for (const m of membersOfGroup(src)) pushNode(m, src.id);
      continue;
    }
    pushNode(src);
  }
  return out;
}

const agentSheetRefs = computed((): AgentRefChip[] => {
  const id = selectedId.value;
  if (!id || !isAgentSelected.value) return [];
  const out: AgentRefChip[] = [];
  const seen = new Set<string>();
  for (const r of collectInboundMediaRefs(id, { max: 6, includeVideo: true })) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    const src = nodes.value.find((n: any) => n.id === r.id);
    const t = String(src?.data?.nodeType || '');
    const kind: AgentRefChip['kind'] =
      t === 'ai.video' || t === 'input.video' || isLikelyVideoUrl(r.url)
        ? 'video'
        : 'image';
    out.push({ id: r.id, url: r.url, label: r.label, linked: true, kind });
  }
  for (const r of agentManualRefs.value) {
    if (!r?.id || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push({ ...r, linked: false });
  }
  return out.slice(0, 6);
});

/** Agent @ 画布：当前工作流上的媒体/文本节点 */
const agentCanvasCites = computed((): AgentCiteItem[] => {
  const agentId = selectedId.value;
  const out: AgentCiteItem[] = [];
  for (const n of nodes.value as any[]) {
    if (!n?.id || n.id === agentId || isWorkflowGroupNode(n)) continue;
    const data = (n.data || {}) as WorkflowFlowNodeData;
    const t = String(data.nodeType || '');
    if (t === 'ai.chat' || t === 'input.note') continue;
    if (t === 'input.text') {
      const label = String(data.label || '文本').trim() || '文本';
      out.push({ id: n.id, label, kind: 'text', source: 'canvas' });
      continue;
    }
    const url = mediaUrlFromNodeData(data);
    if (!url) continue;
    const kind: AgentCiteItem['kind'] =
      t === 'ai.video' || t === 'input.video' || isLikelyVideoUrl(url) ? 'video' : 'image';
    out.push({
      id: n.id,
      label: String(data.label || (kind === 'video' ? '视频' : '图片')).trim(),
      url,
      kind,
      source: 'canvas',
    });
  }
  return out.slice(0, 48);
});

const agentProjectCites = ref<AgentCiteItem[]>([]);

async function loadAgentProjectCites() {
  const pid = String(projectId.value || '').trim();
  if (!pid) {
    agentProjectCites.value = [];
    return;
  }
  try {
    const { data } = await api.get(`/projects/${pid}/assets`);
    const rows = Array.isArray(data) ? data : Array.isArray((data as any)?.items) ? (data as any).items : [];
    agentProjectCites.value = rows
      .filter((a: any) => a?.url)
      .slice(0, 48)
      .map((a: any) => {
        const type = String(a.type || a.mimeType || '').toLowerCase();
        const kind: AgentCiteItem['kind'] = type.includes('video') ? 'video' : 'image';
        return {
          id: String(a.id),
          label: String(a.name || '素材').trim() || '素材',
          url: String(a.url),
          kind,
          source: 'project' as const,
        };
      });
  } catch {
    agentProjectCites.value = [];
  }
}

watch(agentSheetOpen, (v) => {
  if (v) {
    void loadAgentProjectCites();
    scheduleAgentSheetAnchor();
  } else {
    agentSheetAnchor.value = null;
  }
});

const agentSheetAnchor = ref<{ left: number; top: number } | null>(null);

function scheduleAgentSheetAnchor() {
  void nextTick(() => {
    updateAgentSheetAnchor();
    requestAnimationFrame(() => {
      updateAgentSheetAnchor();
      // 弹层首帧高度可能未稳定，再补一帧
      requestAnimationFrame(() => updateAgentSheetAnchor());
    });
  });
}

function updateAgentSheetAnchor() {
  if (!agentSheetOpen.value || !isAgentSelected.value || !selectedId.value) {
    agentSheetAnchor.value = null;
    return;
  }
  const id = selectedId.value;
  const gap = 16;
  let left = 0;
  let midY = 96;
  let placed = false;

  const el =
    (document.querySelector('.vue-flow__node[data-id="' + id + '"]') as HTMLElement | null) ||
    (typeof CSS !== 'undefined' && CSS.escape
      ? (document.querySelector(
          '.vue-flow__node[data-id="' + CSS.escape(id) + '"]',
        ) as HTMLElement | null)
      : null);
  if (el) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      left = r.right + gap;
      midY = r.top + r.height / 2;
      placed = true;
    }
  }

  if (!placed) {
    const n = nodes.value.find((x: any) => x.id === id);
    const wrap = document.querySelector('.flow-wrap') as HTMLElement | null;
    if (!n || !wrap) {
      agentSheetAnchor.value = { left: 360, top: 96 };
      return;
    }
    const wr = wrap.getBoundingClientRect();
    const zoom = Number(viewport.value?.zoom) || 1;
    const vx = Number(viewport.value?.x) || 0;
    const vy = Number(viewport.value?.y) || 0;
    const nw = Number((n as any).dimensions?.width) || 240;
    const nh = Number((n as any).dimensions?.height) || 168;
    const nx = wr.left + vx + (Number(n.position?.x) || 0) * zoom;
    const ny = wr.top + vy + (Number(n.position?.y) || 0) * zoom;
    left = nx + nw * zoom + gap;
    midY = ny + (nh * zoom) / 2;
  }

  // 用弹层真实高度做垂直居中（空态/技能态/对话态高度不同，不能写死 720）
  const sheetRect =
    agentSheetCompRef.value?.getSheetRect?.() ||
    (document.querySelector('.cas-root.anchored .cas') as HTMLElement | null)?.getBoundingClientRect() ||
    null;
  const sheetH = sheetRect && sheetRect.height > 0 ? sheetRect.height : 280;
  const top = midY - sheetH / 2;

  // 无限画布：始终贴节点右侧垂直居中，不做屏幕左右翻转/钳制
  agentSheetAnchor.value = { left: Math.round(left), top: Math.round(top) };
}

watch(
  [
    selectedId,
    isAgentSelected,
    viewport,
    () =>
      nodes.value
        .map(
          (n: any) =>
            n.id + ':' + n.position?.x + ':' + n.position?.y + ':' + (n.dimensions?.width || 0),
        )
        .join('|'),
  ],
  () => {
    if (!agentSheetOpen.value) return;
    scheduleAgentSheetAnchor();
  },
);

const mediaSheetAnchor = ref<{ left: number; top: number } | null>(null);
const textSheetAnchor = ref<{ left: number; top: number } | null>(null);

function scheduleMediaSheetAnchor() {
  void nextTick(() => {
    updateMediaSheetAnchor();
    requestAnimationFrame(() => {
      updateMediaSheetAnchor();
      requestAnimationFrame(() => updateMediaSheetAnchor());
    });
  });
}

function scheduleTextSheetAnchor() {
  void nextTick(() => {
    updateTextSheetAnchor();
    requestAnimationFrame(() => {
      updateTextSheetAnchor();
      requestAnimationFrame(() => updateTextSheetAnchor());
    });
  });
}

function getNodeScreenBox(id: string): {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
} | null {
  const el =
    (document.querySelector('.vue-flow__node[data-id="' + id + '"]') as HTMLElement | null) ||
    (typeof CSS !== 'undefined' && CSS.escape
      ? (document.querySelector(
          '.vue-flow__node[data-id="' + CSS.escape(id) + '"]',
        ) as HTMLElement | null)
      : null);
  if (el) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      return {
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    }
  }
  const n = nodes.value.find((x: any) => x.id === id);
  const wrap = document.querySelector('.flow-wrap') as HTMLElement | null;
  if (!n || !wrap) return null;
  const wr = wrap.getBoundingClientRect();
  const zoom = Number(viewport.value?.zoom) || 1;
  const vx = Number(viewport.value?.x) || 0;
  const vy = Number(viewport.value?.y) || 0;
  const nw = Number((n as any).dimensions?.width) || 240;
  const nh = Number((n as any).dimensions?.height) || 168;
  const left = wr.left + vx + (Number(n.position?.x) || 0) * zoom;
  const top = wr.top + vy + (Number(n.position?.y) || 0) * zoom;
  const width = nw * zoom;
  const height = nh * zoom;
  return { left, top, right: left + width, bottom: top + height, width, height };
}

/** 贴在节点正下方水平居中 */
function updateBottomSheetAnchor(
  open: boolean,
  id: string | null | undefined,
  getRect: (() => DOMRect | null | undefined) | undefined,
  fallbackW: number,
  target: typeof mediaSheetAnchor,
) {
  if (!open || !id) {
    target.value = null;
    return;
  }
  const box = getNodeScreenBox(id);
  if (!box) {
    target.value = { left: 120, top: 200 };
    return;
  }
  const gap = 14;
  const sheetRect = getRect?.() || null;
  const sheetW = sheetRect && sheetRect.width > 0 ? sheetRect.width : fallbackW;
  const left = box.left + box.width / 2 - sheetW / 2;
  const top = box.bottom + gap;
  target.value = { left: Math.round(left), top: Math.round(top) };
}

function updateMediaSheetAnchor() {
  updateBottomSheetAnchor(
    mediaSheetOpen.value && isAiMediaSelected.value,
    selectedId.value,
    () => mediaSheetCompRef.value?.getSheetRect?.(),
    720,
    mediaSheetAnchor,
  );
}

function updateTextSheetAnchor() {
  updateBottomSheetAnchor(
    textSheetOpen.value && isTextSelected.value,
    selectedId.value,
    () => textSheetCompRef.value?.getSheetRect?.(),
    680,
    textSheetAnchor,
  );
}

watch(mediaSheetOpen, (v) => {
  if (v) scheduleMediaSheetAnchor();
  else mediaSheetAnchor.value = null;
});

watch(textSheetOpen, (v) => {
  if (v) scheduleTextSheetAnchor();
  else textSheetAnchor.value = null;
});

watch(
  [
    selectedId,
    isAiMediaSelected,
    isTextSelected,
    viewport,
    () =>
      nodes.value
        .map(
          (n: any) =>
            n.id + ':' + n.position?.x + ':' + n.position?.y + ':' + (n.dimensions?.width || 0),
        )
        .join('|'),
  ],
  () => {
    if (mediaSheetOpen.value) scheduleMediaSheetAnchor();
    if (textSheetOpen.value) scheduleTextSheetAnchor();
  },
);

onMounted(() => {
  window.addEventListener('resize', updateAgentSheetAnchor);
  window.addEventListener('resize', updateMediaSheetAnchor);
  window.addEventListener('resize', updateTextSheetAnchor);
});
onUnmounted(() => {
  window.removeEventListener('resize', updateAgentSheetAnchor);
  window.removeEventListener('resize', updateMediaSheetAnchor);
  window.removeEventListener('resize', updateTextSheetAnchor);
});

function isNodeBusyStatus(status?: string) {
  return (
    status === 'running' ||
    status === 'active' ||
    status === 'queued' ||
    status === 'pending'
  );
}

/** 弹层生成按钮：仅当前节点 busy 时禁用（其它节点可并行跑） */
const mediaSheetRunning = computed(() => isNodeBusyStatus(selectedData.value?.status));

const modelCap = computed(() => {
  const t = selectedData.value?.nodeType || '';
  if (t === 'ai.chat') return 'chat' as const;
  if (
    t === 'ai.image' ||
    t === 'input.image' ||
    t === 'output.preview' ||
    t.startsWith('library.render')
  ) {
    return 'image' as const;
  }
  if (t === 'ai.video') return 'video' as const;
  return null;
});

const modelOptions = computed(() => (modelCap.value ? modelsOf(modelCap.value) : []));
const chatModelOptions = computed(() => modelsOf('chat'));

const textEditValue = computed(() => {
  const id = textActionNodeId.value || selectedId.value;
  const n = nodes.value.find((x: any) => x.id === id);
  const data = n?.data as WorkflowFlowNodeData | undefined;
  return String(data?.params?.value || data?.previewText || '');
});

const textReplaceCanvasNodes = computed((): TextReplaceCanvasItem[] => {
  const exclude = textActionNodeId.value || selectedId.value;
  return nodes.value
    .filter((n: any) => n.data?.nodeType === 'input.text' && n.id !== exclude)
    .map((n: any) => ({
      id: n.id,
      label: String(n.data?.label || '文本'),
      value: String(n.data?.params?.value || n.data?.previewText || ''),
    }));
});

/** 当前文本条的上游引用（文案 chip + 参考图） */
const textSheetIncomingRefs = computed(() => {
  const id = textActionNodeId.value || selectedId.value;
  if (!id) return [] as Array<{ id: string; label: string; url?: string; kind?: 'text' | 'image' }>;
  const mediaById = new Map(
    collectInboundMediaRefs(id, { max: 9 }).map((r) => [r.id, r] as const),
  );
  const seen = new Set<string>();
  const out: Array<{ id: string; label: string; url?: string; kind?: 'text' | 'image' }> = [];
  for (const e of edges.value as any[]) {
    if (e.target !== id) continue;
    const sid = String(e.source || '');
    if (!sid || seen.has(sid)) continue;
    const src = nodes.value.find((n: any) => n.id === sid);
    if (!src || isWorkflowGroupNode(src)) continue;
    seen.add(sid);
    const media = mediaById.get(sid);
    if (media?.url) {
      out.push({
        id: sid,
        label: media.label || String(src.data?.label || '参考图'),
        url: media.url,
        kind: 'image',
      });
      continue;
    }
    const t = String(src.data?.nodeType || '');
    if (t !== 'input.text' && t !== 'ai.chat') continue;
    out.push({
      id: sid,
      label: String(src.data?.label || (t === 'input.text' ? '文本' : '节点')),
      kind: 'text',
    });
  }
  return out;
});

/** 图片连到文本时，同步首张参考图到 params.referenceImage */
function syncTextReferenceFromEdges(nodeId: string) {
  if (!nodeId) return;
  const n = nodes.value.find((x: any) => x.id === nodeId);
  if (!n || String(n.data?.nodeType || '') !== 'input.text') return;
  const refs = collectInboundMediaRefs(nodeId, { max: 1 });
  const next = refs[0]?.url || '';
  const cur = String((n.data as WorkflowFlowNodeData)?.params?.referenceImage || '').trim();
  if (cur === next) return;
  setParamById(nodeId, 'referenceImage', next);
}

function removeTextSheetRef(sourceId: string) {
  const id = textActionNodeId.value || selectedId.value;
  if (!id || !sourceId) return;
  const before = edges.value.length;
  edges.value = (edges.value as any[]).filter(
    (e) => !(e.source === sourceId && e.target === id),
  ) as any[];
  if (edges.value.length !== before) {
    markDirty();
    syncTextReferenceFromEdges(id);
  }
}

const selectedMediaRefs = computed(() => {
  const id = selectedId.value;
  if (!id) return [] as Array<{ id: string; url: string; label?: string; kind?: 'image' | 'video' }>;
  const out: Array<{ id: string; url: string; label?: string; kind?: 'image' | 'video' }> = [];
  const seen = new Set<string>();
  for (const r of collectInboundMediaRefs(id, { max: 9, includeVideo: true })) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    const src = nodes.value.find((n: any) => n.id === r.id);
    const t = String(src?.data?.nodeType || '');
    const kind: 'image' | 'video' =
      t === 'ai.video' || t === 'input.video' || isLikelyVideoUrl(r.url) ? 'video' : 'image';
    out.push({ id: r.id, url: r.url, label: r.label, kind });
  }
  for (const e of edges.value as any[]) {
    if (e.target !== id || String(e.targetHandle || '') !== 'video') continue;
    const src = nodes.value.find((n: any) => n.id === e.source);
    if (!src || seen.has(src.id)) continue;
    const data = (src.data || {}) as WorkflowFlowNodeData;
    const url = String(
      data.previewVideo || data.params?.url || data.params?.lastVideo || data.previewImage || '',
    ).trim();
    seen.add(src.id);
    out.push({
      id: src.id,
      url,
      label: data.label,
      kind: 'video',
    });
  }
  return out;
});

/** @deprecated 兼容旧引用名 */
const selectedImageRefs = selectedMediaRefs;

/** 底部生图条：上游文本 chip（内容来源） */
const mediaSheetTextRefs = computed(() => {
  const id = selectedId.value;
  if (!id) return [] as Array<{ id: string; label: string; text: string }>;
  const out: Array<{ id: string; label: string; text: string }> = [];
  const seen = new Set<string>();
  for (const e of edges.value as any[]) {
    if (e.target !== id) continue;
    const src = nodes.value.find((n: any) => n.id === e.source);
    if (!src || src.data?.nodeType !== 'input.text') continue;
    if (seen.has(src.id)) continue;
    seen.add(src.id);
    out.push({
      id: src.id,
      label: String(src.data?.label || '文本'),
      text: htmlToPlainText(
        String(src.data?.params?.value || src.data?.previewText || ''),
      ),
    });
  }
  return out;
});

const imageReplaceCanvasNodes = computed((): ImageReplaceCanvasItem[] => {
  const exclude = imageActionNodeId.value || selectedId.value;
  return nodes.value
    .filter((n: any) => {
      const t = String(n.data?.nodeType || '');
      if (n.id === exclude) return false;
      if (!['ai.image', 'input.image', 'output.preview'].includes(t)) return false;
      return !!mediaUrlOfNode(n);
    })
    .map((n: any) => ({
      id: n.id,
      label: String(n.data?.label || '图片'),
      url: mediaUrlOfNode(n),
    }));
});

function formatGeneratedAt(raw: unknown): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${d.getMonth() + 1}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const imageDetail = computed(() => {
  const id = imageActionNodeId.value || selectedId.value;
  const n = nodes.value.find((x: any) => x.id === id);
  const data = (n?.data || null) as WorkflowFlowNodeData | null;
  const params = (data?.params || {}) as Record<string, unknown>;
  return {
    url: n ? mediaUrlOfNode(n as any) : '',
    model: String(params.model || '').trim(),
    aspect: String(params.aspect || '').trim(),
    // 生成信息：生图接口实际传入的提示词（与输入框自定义文案分离）
    prompt: String(params.lastUsedPrompt || params.apiPrompt || '').trim(),
    generatedAt: formatGeneratedAt(params.generatedAt || params.completedAt),
    fileName: String(data?.label || params.name || 'image').trim() || 'image',
  };
});

function openImageDetailFor(id: string) {
  if (!id) return;
  if (mediaClickTimer) {
    clearTimeout(mediaClickTimer);
    mediaClickTimer = null;
  }
  if (textClickTimer) {
    clearTimeout(textClickTimer);
    textClickTimer = null;
  }
  imageActionNodeId.value = id;
  ensureNodeSelected(id);
  mediaSheetOpen.value = false;
  agentSheetOpen.value = false;
  textSheetOpen.value = false;
  closeMenu();
  ignorePaneClickUntil = Date.now() + 400;
  imageDetailOpen.value = true;
}

function onImageDetailClose() {
  imageDetailOpen.value = false;
  ignorePaneClickUntil = Date.now() + 400;
  const id = imageActionNodeId.value || selectedId.value;
  if (id) nextTick(() => ensureNodeSelected(id));
}

function onImageDetailUsePrompt(prompt: string) {
  const id = imageActionNodeId.value || selectedId.value;
  const t = String(prompt || '').trim();
  if (!id || !t) return;
  setParamById(id, 'prompt', t);
  mediaSheetOpen.value = true;
  ElMessage.success('已写入提示词');
}

function removeMediaSheetRef(sourceId: string) {
  const id = selectedId.value;
  if (!id || !sourceId) return;
  pushUndo();
  const next: any[] = [];
  let changed = false;
  for (const e of edges.value as any[]) {
    if (e.target !== id) {
      next.push(e);
      continue;
    }
    if (e.source === sourceId) {
      changed = true;
      continue;
    }
    const src = nodes.value.find((n: any) => n.id === e.source);
    if (src && isWorkflowGroupNode(src)) {
      const members = membersOfGroup(src).filter((m: any) => {
        const t = String(m.data?.nodeType || '');
        if (t === 'input.text' || t === 'input.note' || t === 'ai.chat') return false;
        return Boolean(mediaUrlFromNodeData(m.data as WorkflowFlowNodeData));
      });
      if (!members.some((m: any) => m.id === sourceId)) {
        next.push(e);
        continue;
      }
      // 去掉分组边，其余成员改为直连，便于单独移除某一张
      changed = true;
      const th = String(e.targetHandle || 'image') || 'image';
      for (const m of members) {
        if (m.id === sourceId) continue;
        const edge = {
          id: `e_${m.id}_image_${id}_${th}`,
          source: m.id,
          sourceHandle: 'image',
          target: id,
          targetHandle: th,
        };
        next.push({ ...edge, ...styleEdgeFromNodes(edge, nodes.value as any) });
      }
      continue;
    }
    next.push(e);
  }
  if (!changed) return;
  edges.value = next as any;
  markDirty();
  syncAiVideoRefMode(id, 'edges');
}

/** 统计指向视频节点的图片类上游（分组会展开组内图片） */
/** 上游静帧参考（不含纯视频） */
function countVideoImageInbound(nodeId: string) {
  return collectInboundMediaRefs(nodeId, { max: 9 }).length;
}

/** 是否存在图/视频媒体入边（含 video→video；源节点尚无 URL 也算） */
function hasAiVideoMediaInbound(nodeId: string) {
  if (collectInboundMediaRefs(nodeId, { max: 9, includeVideo: true }).length > 0) return true;
  if (countInboundVideoRefs(nodeId) > 0) return true;
  for (const e of edges.value as any[]) {
    if (e.target !== nodeId) continue;
    const th = String(e.targetHandle || '');
    if (th && th !== 'image' && th !== 'endImage' && th !== 'images' && th !== 'video') continue;
    const src = nodes.value.find((n: any) => n.id === e.source);
    if (!src) continue;
    if (isWorkflowGroupNode(src)) {
      if (
        membersOfGroup(src).some((m: any) => {
          const t = String(m.data?.nodeType || '');
          return (
            t === 'ai.image' ||
            t === 'input.image' ||
            t === 'output.preview' ||
            t === 'ai.video' ||
            t === 'input.video'
          );
        })
      ) {
        return true;
      }
      continue;
    }
    const t = String(src.data?.nodeType || '');
    if (
      t === 'ai.image' ||
      t === 'input.image' ||
      t === 'output.preview' ||
      t === 'ai.video' ||
      t === 'input.video'
    ) {
      return true;
    }
  }
  return false;
}

/** 从上游图片（含分组展开）同步视频宽高比，与图片保持一致 */
function syncAiVideoAspectFromInbound(nodeId: string, force = false) {
  const n = nodes.value.find((x: any) => x.id === nodeId);
  if (!n || String(n.data?.nodeType || '') !== 'ai.video') return;
  const refs = collectInboundMediaRefs(nodeId, { max: 1 });
  if (!refs.length) return;
  const src = nodes.value.find((x: any) => x.id === refs[0]!.id);
  if (!src || isWorkflowGroupNode(src)) return;
  const from = String((src.data as WorkflowFlowNodeData)?.params?.aspect || '').trim();
  if (!from) return;
  const cur = String((n.data as WorkflowFlowNodeData)?.params?.aspect || '').trim();
  if (!force && cur && cur !== DEFAULT_MEDIA_ASPECT) return;
  if (cur === from) return;
  setParamById(nodeId, 'aspect', from);
}

/**
 * 无图/视频参考连线 → 文生视频；
 * 有图或视频连线 → 默认全能参考（用户手选首尾帧且仍有静帧时保留）。
 */
function syncAiVideoRefMode(nodeId: string, reason: 'edges' | 'open') {
  const n = nodes.value.find((x: any) => x.id === nodeId);
  if (!n || String(n.data?.nodeType || '') !== 'ai.video') return;
  const data = (n.data || {}) as WorkflowFlowNodeData;
  const cur = String(data.params?.refMode || '').trim().toLowerCase();
  const hasImg = countVideoImageInbound(nodeId) > 0;
  const hasMedia = hasAiVideoMediaInbound(nodeId);
  let next = cur;
  if (!hasMedia) {
    next = 'text';
  } else if ((cur === 'frames' || cur === '首尾帧') && hasImg) {
    next = 'frames';
  } else if (reason === 'edges' || cur === 'text' || cur === 't2v' || cur === '文生视频' || !cur) {
    next = 'omni';
  } else if (cur === 'frames' || cur === '首尾帧') {
    // 只连了视频、没有静帧时，首尾帧不可用 → 全能参考
    next = 'omni';
  } else {
    next = 'omni';
  }
  if (hasImg) {
    // 连上图片/分组时：默认比例跟上游图片对齐
    syncAiVideoAspectFromInbound(nodeId, reason === 'edges');
  }
  if (next === cur) return;
  setParamById(nodeId, 'refMode', next);
}

const dockNodeItems = computed(() =>
  nodes.value
    .filter((n: any) => !isWorkflowGroupNode(n))
    .map((n: any) => {
      const t = String(n.data?.nodeType || '');
      const name = String(n.data?.label || n.data?.params?.name || n.data?.catalog?.title || '').trim();
      const fallback =
        t === 'ai.video' || t === 'input.video'
          ? '视频'
          : t === 'ai.image' || t === 'input.image'
            ? '图片'
            : t === 'input.note'
              ? '备注'
              : t === 'input.text'
                ? '提示词'
                : t;
      return {
        id: n.id,
        label: name || fallback,
        type: t,
      };
    }),
);

function onNodesChange(changes: NodeChange[]) {
  if (suppressDirty.value || bootLoading.value) {
    // 启动中仍要应用选中/尺寸等非删除变更，位置以服务端为准
    const safe = changes.filter((c) => c.type !== 'remove' && c.type !== 'add');
    if (safe.length) nodes.value = applyNodeChanges(safe, nodes.value);
    return;
  }

  // 拖动吸附：边/中心对齐其它节点时出辅助线并微调位置（分组拖拽关闭吸附，避免框与成员错位）
  const next = [...changes];
  const dragPos = next.find(
    (c): c is NodeChange & { type: 'position'; dragging: boolean; position: { x: number; y: number }; id: string } =>
      c.type === 'position' && Boolean((c as any).dragging) && Boolean((c as any).position),
  );
  const dragNode = dragPos
    ? nodes.value.find((n: any) => n.id === dragPos.id)
    : null;
  if (
    dragPos &&
    next.filter((c) => c.type === 'position' && (c as any).dragging).length === 1 &&
    !isWorkflowGroupNode(dragNode)
  ) {
    const helper = getAlignHelperLines(dragPos as any, nodes.value as any, 6);
    if (helper.snapPosition.x != null) dragPos.position.x = helper.snapPosition.x;
    if (helper.snapPosition.y != null) dragPos.position.y = helper.snapPosition.y;
    alignGuideV.value = helper.vertical;
    alignGuideH.value = helper.horizontal;
  } else if (!next.some((c) => c.type === 'position' && (c as any).dragging)) {
    alignGuideH.value = undefined;
    alignGuideV.value = undefined;
  }

  nodes.value = applyNodeChanges(next, nodes.value);
  if (next.some((c) => c.type === 'select')) {
    syncGroupMemberPointerLock();
  }
  const structural = next.some(
    (c) => c.type === 'position' || c.type === 'dimensions' || c.type === 'remove' || c.type === 'add',
  );
  if (structural) markDirty();
}

function onEdgesChange(changes: EdgeChange[]) {
  if (suppressDirty.value || bootLoading.value) {
    const safe = changes.filter((c) => c.type !== 'remove');
    if (safe.length) edges.value = applyEdgeChanges(safe, edges.value);
    return;
  }
  const removedTargets = changes
    .filter((c): c is EdgeChange & { type: 'remove'; id: string } => c.type === 'remove')
    .map((c) => {
      const old = (edges.value as any[]).find((e) => e.id === c.id);
      return String(old?.target || '');
    })
    .filter(Boolean);
  edges.value = applyEdgeChanges(changes, edges.value);
  markDirty();
  for (const tid of new Set(removedTargets)) {
    syncAiVideoRefMode(tid, 'edges');
    syncTextReferenceFromEdges(tid);
  }
}

async function hydrateEdges(list: any[]) {
  const styled = (list || []).map((e) => ({
    ...e,
    ...styleEdgeFromNodes(e, nodes.value),
    type: 'default' as const,
    animated: false,
  }));
  edges.value = styled;
  await nextTick();
  try {
    updateNodeInternals(nodes.value.map((n: any) => n.id));
  } catch {
    /* ignore */
  }
  await nextTick();
  await new Promise((r) => setTimeout(r, 80));
  edges.value = styled.map((e) => ({ ...e, id: e.id }));
  await nextTick();
  try {
    updateNodeInternals(nodes.value.map((n: any) => n.id));
  } catch {
    /* ignore */
  }
  syncRelatedEdgeFlow();
}

/**
 * 选中节点时，相关连线开启动画传输效果。
 * 规律：路径始终 source→target（左入右出）
 * - 选中节点为 target（左侧入线）→ 流向选中节点（传进来）
 * - 选中节点为 source（右侧出线）→ 从选中节点流出（传出去）
 */
function syncRelatedEdgeFlow() {
  const ids = new Set<string>();
  for (const n of nodes.value as any[]) {
    if (n.selected) ids.add(String(n.id));
  }
  if (selectedId.value) ids.add(selectedId.value);

  let changed = false;
  const next = (edges.value as any[]).map((e) => {
    const isOut = ids.has(String(e.source)); // 右侧连出
    const isIn = ids.has(String(e.target)); // 左侧连入
    const related = isOut || isIn;
    // both：两端都在选中集合里，仍按路径正向流动
    const dir = related ? (isOut && isIn ? 'both' : isOut ? 'out' : 'in') : '';
    const cls = related ? `wf-edge wf-edge-flow wf-edge-flow--${dir}` : 'wf-edge';
    if (Boolean(e.animated) === related && String(e.class || '') === cls) return e;
    changed = true;
    return { ...e, animated: related, class: cls };
  });
  if (changed) edges.value = next as any;
}

function setParam(key: string, value: string) {
  if (!selectedId.value) return;
  setParamById(selectedId.value, key, value);
}

function setParamById(nodeId: string, key: string, value: string) {
  const n = nodes.value.find((x: any) => x.id === nodeId);
  if (!n) return;
  const data = (n.data || {}) as WorkflowFlowNodeData;
  const next = { ...(data.params || {}), [key]: value };
  if (key === 'url') next.assetId = '';
  n.data = { ...data, params: next };
  if (key === 'url') {
    if (data.nodeType === 'input.image') {
      n.data.previewImage = value;
      n.data.previewVideo = '';
    } else if (data.nodeType === 'input.video' || data.nodeType === 'ai.video') {
      n.data.previewVideo = value;
      if (data.nodeType === 'ai.video') next.lastVideo = value;
      n.data.params = next;
    }
  }
  markDirty();
}

function setLabel(value: string) {
  const n = nodes.value.find((x: any) => x.id === selectedId.value);
  if (!n) return;
  n.data = { ...(n.data as WorkflowFlowNodeData), label: value };
  markDirty();
}

function setLabelById(nodeId: string, value: string) {
  const n = nodes.value.find((x: any) => x.id === nodeId);
  if (!n) return;
  n.data = { ...(n.data as WorkflowFlowNodeData), label: value };
  markDirty();
}

function isMediaSheetType(t: string) {
  return t === 'ai.image' || t === 'ai.video' || t === 'input.image' || t === 'output.preview';
}

function syncSheetForSelection(nodeId: string) {
  const n = nodes.value.find((x: any) => x.id === nodeId);
  const t = String(n?.data?.nodeType || '');
  mediaSheetOpen.value = isMediaSheetType(t);
  if (t !== 'input.text') textSheetOpen.value = false;
}

function openTextEditForSelected() {
  textActionNodeId.value = selectedId.value;
  textEditOpen.value = true;
}

function onTextEditSave(value: string) {
  const id = textActionNodeId.value || selectedId.value;
  if (!id) return;
  setParamById(id, 'value', value);
  const n = nodes.value.find((x: any) => x.id === id);
  if (n) {
    const data = (n.data || {}) as WorkflowFlowNodeData;
    n.data = { ...data, previewText: value };
  }
  markDirty();
}

function onTextReplaceApply(text: string) {
  const id = textActionNodeId.value || selectedId.value;
  if (!id) return;
  setParamById(id, 'value', text);
  const n = nodes.value.find((x: any) => x.id === id);
  if (n) {
    const data = (n.data || {}) as WorkflowFlowNodeData;
    n.data = { ...data, previewText: text };
  }
  markDirty();
  ElMessage.success('已替换节点内容');
}

async function runTextGenerate() {
  const id = selectedId.value;
  if (!id || !isTextSelected.value) return;
  const prompt = textGenPrompt.value.trim();
  if (!prompt) return;
  const n = nodes.value.find((x: any) => x.id === id);
  if (!n) return;
  textGenRunning.value = true;
  // 节点上打 running，卡片显示 loading
  n.data = { ...(n.data as WorkflowFlowNodeData), status: 'running', statusMessage: '正在生成提示词' };
  try {
    const refTexts = textSheetIncomingRefs.value
      .filter((r) => r.kind !== 'image')
      .map((r) => {
        const src = nodes.value.find((x: any) => x.id === r.id);
        return htmlToPlainText(
          String(
            (src?.data as any)?.params?.value || (src?.data as any)?.previewText || '',
          ),
        );
      })
      .filter(Boolean);
    const refImages = textSheetIncomingRefs.value
      .filter((r) => r.kind === 'image' && r.url)
      .map((r) => String(r.url || '').trim())
      .filter(Boolean);
    const messages = buildStudioTextGenMessages(textGenMode.value, prompt, refTexts, refImages);
    const raw = await chatCompletion(messages, textGenModel.value || undefined);
    const text = sanitizeStudioTextPrompt(raw);
    if (!text.trim()) {
      n.data = {
        ...(n.data as WorkflowFlowNodeData),
        status: undefined,
        statusMessage: undefined,
      };
      ElMessage.warning('未生成有效提示词');
      return;
    }
    setParamById(id, 'value', text);
    const modeMeta = studioTextPromptModeMeta(textGenMode.value);
    const cur = nodes.value.find((x: any) => x.id === id);
    if (cur) {
      const data = (cur.data || {}) as WorkflowFlowNodeData;
      const label = String(data.label || '').trim();
      const nextLabel = isDefaultTextNodeLabel(label) ? modeMeta.defaultLabel : label;
      cur.data = {
        ...data,
        label: nextLabel,
        previewText: text,
        status: 'completed',
        statusMessage: undefined,
      };
    }
    markDirty();
    ElMessage.success('出图提示词已生成');
    // 完成态稍亮一下后清掉，避免一直占着状态点
    setTimeout(() => {
      const done = nodes.value.find((x: any) => x.id === id);
      if (done && (done.data as any)?.status === 'completed') {
        done.data = {
          ...(done.data as WorkflowFlowNodeData),
          status: undefined,
          statusMessage: undefined,
        };
      }
    }, 1200);
  } catch (e: any) {
    const cur = nodes.value.find((x: any) => x.id === id);
    if (cur) {
      cur.data = {
        ...(cur.data as WorkflowFlowNodeData),
        status: 'failed',
        statusMessage: e?.message || '提示词生成失败',
      };
    }
    ElMessage.error(e?.message || '文本生成失败');
    setTimeout(() => {
      const failed = nodes.value.find((x: any) => x.id === id);
      if (failed && (failed.data as any)?.status === 'failed') {
        failed.data = {
          ...(failed.data as WorkflowFlowNodeData),
          status: undefined,
          statusMessage: undefined,
        };
      }
    }, 2000);
  } finally {
    textGenRunning.value = false;
  }
}

function statusLabel(s?: string) {
  const map: Record<string, string> = {
    queued: '排队',
    active: '执行中',
    completed: '完成',
    failed: '失败',
    cancelled: '已取消',
  };
  return map[s || ''] || s || '';
}

let lastRejectMsg = '';
let connectSucceeded = false;
let connectFrom: ConnectFromHandle | null = null;

function checkConnection(connection: Connection) {
  const verdict = explainConnectReject(connection, nodes.value, edges.value);
  if (!verdict.ok) {
    lastRejectMsg = verdict.message;
    return false;
  }
  lastRejectMsg = '';
  return true;
}

function onConnectStart(params: {
  nodeId?: string | null;
  handleId?: string | null;
  handleType?: string | null;
}) {
  connectSucceeded = false;
  lastRejectMsg = '';
  if (
    params?.nodeId &&
    (params.handleType === 'source' || params.handleType === 'target')
  ) {
    connectFrom = {
      nodeId: params.nodeId,
      handleId: params.handleId ?? null,
      type: params.handleType,
    };
  } else {
    connectFrom = null;
  }
}

function clientPointOf(event: MouseEvent | TouchEvent) {
  if ('changedTouches' in event && event.changedTouches?.[0]) {
    return {
      x: event.changedTouches[0].clientX,
      y: event.changedTouches[0].clientY,
    };
  }
  const m = event as MouseEvent;
  return { x: m.clientX, y: m.clientY };
}

function onConnectEnd(event?: MouseEvent | TouchEvent) {
  try {
    // 松手在节点本体上：自动落到兼容端口（不必对准小 + 号）
    if (!connectSucceeded && connectFrom && event) {
      const { x, y } = clientPointOf(event);
      const dropNodeId = findNodeIdAtClientPoint(x, y);
      if (dropNodeId && dropNodeId !== connectFrom.nodeId) {
        const conn = resolveNodeDropConnection(
          connectFrom,
          dropNodeId,
          nodes.value,
          edges.value,
        );
        if (conn) {
          onConnect(conn);
        } else if (!lastRejectMsg) {
          ElMessage.warning('该节点没有可连接的端口');
        }
      }
    }
    if (!connectSucceeded && lastRejectMsg) {
      ElMessage.warning(lastRejectMsg);
    }
  } finally {
    connectSucceeded = false;
    lastRejectMsg = '';
    connectFrom = null;
  }
}

function onConnect(connection: Connection) {
  // 文案 → 图片左侧口：自动改接到 prompt（把文档交给图片）
  const conn = (normalizeConnection(connection, nodes.value) || connection) as Connection;
  const verdict = explainConnectReject(conn, nodes.value, edges.value);
  if (!verdict.ok) {
    // 留给 onConnectEnd 统一提示，避免拖到节点本体时重复弹两次
    lastRejectMsg = verdict.message;
    return;
  }
  connectSucceeded = true;
  lastRejectMsg = '';
  const styled = styleEdgeFromNodes(conn, nodes.value);
  edges.value = addEdge(
    {
      ...conn,
      id: `e_${conn.source}_${conn.sourceHandle}_${conn.target}_${conn.targetHandle}`,
      ...styled,
    },
    edges.value,
  ) as any[];

  // 文案连到生图/视频：仅作参考 chip，不写入输入框
  if (conn.target) {
    syncAiVideoRefMode(String(conn.target), 'edges');
    syncTextReferenceFromEdges(String(conn.target));
  }
  markDirty();
  nextTick(() => syncRelatedEdgeFlow());
}

let textClickTimer: ReturnType<typeof setTimeout> | null = null;
let mediaClickTimer: ReturnType<typeof setTimeout> | null = null;
/** 弹层关闭后短时间内忽略 pane click，避免蒙层 mousedown 穿透取消选中 */
let ignorePaneClickUntil = 0;
/** 点选节点后短时忽略 move-start 收起底部条（选中时 Vue Flow 易误触发） */
let ignoreSheetCloseUntil = 0;

function ensureNodeSelected(id: string) {
  if (!id) return;
  selectedId.value = id;
  nodes.value = nodes.value.map((n: any) => ({
    ...n,
    selected: n.id === id,
  }));
  syncGroupMemberPointerLock();
  nextTick(() => syncRelatedEdgeFlow());
}

/** 已废弃：连线文本不得写入输入框；运行时由后端 params.prompt 优先、连线文案兜底 */
function syncPromptFromTextEdges(_nodeId: string, _opts?: { force?: boolean }) {
  /* no-op */
}

function openMediaSheetFor(id: string) {
  if (!id) return;
  imageActionNodeId.value = id;
  ensureNodeSelected(id);
  // 若输入框仍是旧逻辑自动灌入的连线全文，清空一次，留给用户自定义
  clearAutoFilledPromptIfMatchesTextRef(id);
  syncAiVideoRefMode(id, 'open');
  ignoreSheetCloseUntil = Date.now() + 400;
  mediaSheetOpen.value = true;
  agentSheetOpen.value = false;
  textSheetOpen.value = false;
  scheduleMediaSheetAnchor();
}

/** 旧版会把连线文本写入 prompt；若内容与上游文本完全一致则清掉 */
function clearAutoFilledPromptIfMatchesTextRef(nodeId: string) {
  const n = nodes.value.find((x: any) => x.id === nodeId);
  if (!n || isWorkflowGroupNode(n)) return;
  const data = (n.data || {}) as WorkflowFlowNodeData;
  const cur = String(data.params?.prompt || '').trim();
  if (!cur) return;
  const bodies: string[] = [];
  for (const e of edges.value as any[]) {
    if (e.target !== nodeId) continue;
    const src = nodes.value.find((x: any) => x.id === e.source);
    if (!src || src.data?.nodeType !== 'input.text') continue;
    const body = htmlToPlainText(
      String((src.data as any)?.params?.value || (src.data as any)?.previewText || ''),
    );
    if (body) bodies.push(body);
  }
  if (!bodies.length) return;
  const joined = bodies.join('\n\n').trim();
  if (cur === joined) {
    setParamById(nodeId, 'prompt', '');
  }
}

function openAgentSheetFor(id: string) {
  if (!id) return;
  imageActionNodeId.value = id;
  ensureNodeSelected(id);
  ignoreSheetCloseUntil = Date.now() + 400;
  agentSheetOpen.value = true;
  mediaSheetOpen.value = false;
  textSheetOpen.value = false;
  hydrateAgentLiveFromNode(id);
  // 打开时：把当前选中的图片节点连到 Agent（有连线即出现在参考槽）
  nextTick(() => ensureSelectedMediaLinkedToAgent(id));
  scheduleAgentSheetAnchor();
}

function closeAgentSheet() {
  // 流式执行中允许关弹层，但卡片上仍会继续显示增量文本
  agentSheetOpen.value = false;
  ignorePaneClickUntil = Date.now() + 400;
}

function mirrorAgentPreview(nodeId: string, text: string) {
  const n = nodes.value.find((x: any) => x.id === nodeId);
  if (!n || isWorkflowGroupNode(n)) return;
  const cur = (n.data || {}) as WorkflowFlowNodeData;
  if (cur.previewText === text) return;
  n.data = { ...cur, previewText: text, status: 'running', statusMessage: 'Agent 执行中…' };
}

function scheduleMirrorAgentPreview(nodeId: string) {
  if (agentPreviewRaf) cancelAnimationFrame(agentPreviewRaf);
  agentPreviewRaf = requestAnimationFrame(() => {
    agentPreviewRaf = 0;
    if (agentLive.nodeId !== nodeId) return;
    mirrorAgentPreview(nodeId, agentLive.text);
  });
}

/** 图片/视频节点 → Agent.image 口 */
function ensureMediaAgentEdge(mediaId: string, agentId: string) {
  if (!mediaId || !agentId || mediaId === agentId) return false;
  const src = nodes.value.find((x: any) => x.id === mediaId);
  const st = String(src?.data?.nodeType || '');
  const sourceHandle =
    st === 'input.video' || st === 'ai.video' ? 'video' : 'image';
  const exists = (edges.value as any[]).some(
    (e) =>
      e.source === mediaId &&
      e.target === agentId &&
      String(e.targetHandle || '') === 'image',
  );
  if (exists) return false;
  const styled = styleEdgeFromNodes(
    {
      source: mediaId,
      target: agentId,
      sourceHandle,
      targetHandle: 'image',
    } as any,
    nodes.value,
  );
  edges.value = [
    ...(edges.value as any[]),
    {
      id: `e_${mediaId}_${sourceHandle}_${agentId}_image`,
      source: mediaId,
      target: agentId,
      sourceHandle,
      targetHandle: 'image',
      ...styled,
      type: 'default',
      animated: false,
    },
  ] as any[];
  markDirty();
  return true;
}

/** 图片节点 → 文本左口（参考图） */
function ensureMediaTextEdge(mediaId: string, textId: string) {
  if (!mediaId || !textId || mediaId === textId) return false;
  const exists = (edges.value as any[]).some(
    (e) =>
      e.source === mediaId &&
      e.target === textId &&
      String(e.targetHandle || '') === 'text',
  );
  if (exists) return false;
  const conn = {
    source: mediaId,
    target: textId,
    sourceHandle: 'image',
    targetHandle: 'text',
  } as Connection;
  if (!explainConnectReject(conn, nodes.value, edges.value).ok) return false;
  const styled = styleEdgeFromNodes(conn as any, nodes.value);
  edges.value = [
    ...(edges.value as any[]),
    {
      id: `e_${mediaId}_image_${textId}_text`,
      ...conn,
      ...styled,
      type: 'default',
      animated: false,
    },
  ] as any[];
  markDirty();
  return true;
}

function ensureSelectedMediaLinkedToAgent(agentId: string) {
  const selectedMedia = nodes.value.filter((n: any) => {
    if (!n.selected || n.id === agentId) return false;
    const t = String(n.data?.nodeType || '');
    return (
      ['ai.image', 'input.image', 'ai.video', 'input.video'].includes(t) &&
      mediaUrlFromNodeData(n.data)
    );
  });
  let linked = 0;
  for (const n of selectedMedia.slice(0, 4)) {
    if (ensureMediaAgentEdge(n.id, agentId)) linked += 1;
  }
  return linked;
}

function refreshAgentRefs(opts?: { silent?: boolean }) {
  const agentId = selectedId.value;
  if (!agentId || !isAgentSelected.value) return;
  // 刷新 = 把当前选中媒体连到 Agent；参考槽只展示连线
  const linked = ensureSelectedMediaLinkedToAgent(agentId);
  agentManualRefs.value = [];
  if (!opts?.silent) {
    ElMessage.success(
      linked > 0
        ? `已连入 ${linked} 个参考`
        : agentSheetRefs.value.length
          ? `当前已有 ${agentSheetRefs.value.length} 个参考连线`
          : '请先在画布选中图片节点，再点同步',
    );
  }
}

function onAgentPickRef(kind: 'image' | 'grid' | 'video') {
  const agentId = selectedId.value;
  if (!agentId || !isAgentSelected.value) return;
  // 不再打开「媒体 / 节点」面板，直接本地上传
  paletteRef.value?.collapse?.();
  paletteOpen.value = false;
  libraryOpen.value = false;
  pendingFillNodeId.value = agentId;
  pendingRefPick.value = true;
  if (kind === 'grid') {
    void uploadTextRefForAgent(agentId);
    return;
  }
  pendingRefMediaKind.value = kind === 'video' ? 'video' : 'image';
  void uploadMediaOrRef(true, kind === 'video' ? 'video' : 'image');
}

/** Agent：本地上传文本文档，落成文本节点并引用 */
async function uploadTextRefForAgent(agentId: string) {
  const files = await pickLocalFile({
    accept: '.txt,.md,.markdown,.csv,.json,text/plain,text/markdown,text/csv,application/json',
    multiple: false,
  });
  if (!files.length) {
    pendingRefPick.value = false;
    pendingFillNodeId.value = '';
    return;
  }
  const file = files[0];
  uploading.value = true;
  try {
    const body = (await file.text()).trim();
    if (!body) {
      ElMessage.warning('文件内容为空');
      return;
    }
    const def = catalogMap(catalog.value).get('input.text');
    if (!def) {
      ElMessage.error('缺少文本节点类型');
      return;
    }
    const agentNode = nodes.value.find((x: any) => x.id === agentId);
    if (!agentNode || isWorkflowGroupNode(agentNode)) return;
    const id = newNodeId('n');
    const ax = Number(agentNode.position?.x || 0);
    const ay = Number(agentNode.position?.y || 0);
    const label = String(file.name || '文档').replace(/\.[^.]+$/, '') || '文档';
    nodes.value = [
      ...nodes.value,
      {
        id,
        type: 'workflow',
        position: { x: ax - 300, y: ay + agentManualRefs.value.length * 40 },
        data: {
          label,
          nodeType: 'input.text',
          params: {
            ...(def.defaultParams || {}),
            value: body,
            prompt: body,
          },
          catalog: def,
          previewText: body.slice(0, 200),
        } satisfies WorkflowFlowNodeData,
      },
    ];
    await nextTick();
    try {
      updateNodeInternals([id, agentId]);
    } catch {
      /* ignore */
    }
    await nextTick();
    await new Promise((r) => setTimeout(r, 40));
    // 文本 → Agent 左口（归一到 image）
    const conn = {
      source: id,
      target: agentId,
      sourceHandle: 'text',
      targetHandle: 'image',
    } as Connection;
    if (explainConnectReject(conn, nodes.value, edges.value).ok) {
      const styled = styleEdgeFromNodes(conn as any, nodes.value);
      edges.value = [
        ...(edges.value as any[]),
        {
          id: `e_${id}_text_${agentId}_image`,
          ...conn,
          ...styled,
          type: 'default',
          animated: false,
        },
      ] as any[];
    }
    agentSheetCompRef.value?.insertCite?.({
      label,
      id,
      mediaKind: 'text',
    });
    markDirty();
    ElMessage.success('已上传文档并引用到 Agent');
  } catch (e: any) {
    ElMessage.error(e?.message || '上传文档失败');
  } finally {
    pendingRefPick.value = false;
    pendingFillNodeId.value = '';
    uploading.value = false;
  }
}

function onAgentManageSkills() {
  void router.push({ path: '/skills' });
}

function onAgentCiteItem(item: AgentCiteItem) {
  const agentId = selectedId.value;
  if (!agentId || !isAgentSelected.value) return;

  if (item.source === 'canvas') {
    const n = nodes.value.find((x: any) => x.id === item.id);
    const t = String(n?.data?.nodeType || '');
    if (t === 'input.text') {
      // 文本仅写入 @ 标签，不强制连线
      markDirty();
      return;
    }
    if (item.url) {
      ensureMediaAgentEdge(item.id, agentId);
      setParamById(agentId, 'referenceImage', item.url);
      markDirty();
    }
    return;
  }

  // 本项目资产：落成画布节点并连线（@ 标签已由弹层 insertCite）
  if (item.url) {
    applyAssetToNode(
      agentId,
      {
        id: item.id,
        name: item.label,
        url: item.url,
        type: item.kind === 'video' ? 'video' : 'image',
      } as HistoryAsset,
      { insertCite: false },
    );
  }
}

function resetAgentNodeToEmpty(nodeId: string) {
  if (!nodeId) return;
  if (agentLive.streaming && agentLive.nodeId === nodeId) {
    agentAbort?.abort();
    agentAbort = null;
  }
  agentSheetCompRef.value?.resetSession?.();
  resetAgentLive({ nodeId, stepsOpen: true });

  // 清空手动参考，并拆掉指向该 Agent 的入边
  if (selectedId.value === nodeId) agentManualRefs.value = [];
  edges.value = (edges.value as any[]).filter((e) => e.target !== nodeId) as any[];

  const n = nodes.value.find((x: any) => x.id === nodeId);
  if (n && !isWorkflowGroupNode(n)) {
    const data = (n.data || {}) as WorkflowFlowNodeData;
    const params = { ...(data.params || {}) };
    params.skillId = '';
    params.slash = '';
    params.system = '';
    params.prompt = '';
    params.promptDoc = '';
    params.citedImageUrls = '';
    params.citedVideoUrls = '';
    params.agentTitle = '';
    params.agentIntent = 'run';
    params.agentMode = 'agent';
    clearPersistedAgentTranscript(params);
    delete params.referenceImage;
    delete params.refs;
    n.data = {
      ...data,
      label: 'Agent',
      params,
      previewText: '',
      status: undefined,
      statusMessage: undefined,
    };
  }
  clearNodesBusy([nodeId]);
  markDirty();
}

function onAgentRestart() {
  const id = selectedId.value;
  if (!id || !isAgentSelected.value) return;
  resetAgentNodeToEmpty(id);
}

function removeAgentRef(refId: string) {
  agentManualRefs.value = agentManualRefs.value.filter((r) => r.id !== refId);
  // 连线参考：同步拆边
  const agentId = selectedId.value;
  if (!agentId || !refId) return;
  const before = edges.value.length;
  edges.value = (edges.value as any[]).filter(
    (e) => !(e.source === refId && e.target === agentId),
  ) as any[];
  if (edges.value.length !== before) markDirty();
}

function onAgentAsk() {
  const p = String(selectedData.value?.params?.prompt || '').trim();
  if (!p) {
    ElMessage.info('先写一句需求，再点询问');
    return;
  }
  setParam('agentIntent', 'ask');
  agentSheetOpen.value = false;
  searchOpen.value = false;
  moreMenuOpen.value = false;
  chatOpen.value = true;
  void nextTick(async () => {
    chatPanelRef.value?.bindCurrentWorkflow?.();
    await chatPanelRef.value?.sendNow?.(p);
  });
}

function onAgentUpdateParam(key: string, value: string) {
  setParam(key, value);
  // 技能被清除时同步标题；选用技能时由 sheet 的 update-label 写入技能名
  if (key === 'skillId' && !String(value || '').trim() && selectedId.value) {
    setLabelById(selectedId.value, 'Agent');
  }
}

function onNodeClick(ev: NodeMouseEvent) {
  if (isWorkflowGroupNode(ev.node)) {
    ensureNodeSelected(ev.node.id);
    mediaSheetOpen.value = false;
    agentSheetOpen.value = false;
    textSheetOpen.value = false;
    return;
  }
  ensureNodeSelected(ev.node.id);
  ignoreSheetCloseUntil = Date.now() + 400;
  const t = String(ev.node.data?.nodeType || '');
  if (t === 'input.text') {
    // 单击打开对话条；延迟以区分双击编辑
    if (textClickTimer) clearTimeout(textClickTimer);
    if (mediaClickTimer) {
      clearTimeout(mediaClickTimer);
      mediaClickTimer = null;
    }
    mediaSheetOpen.value = false;
    agentSheetOpen.value = false;
    textClickTimer = setTimeout(() => {
      textActionNodeId.value = ev.node.id;
      ensureNodeSelected(ev.node.id);
      ignoreSheetCloseUntil = Date.now() + 400;
      textSheetOpen.value = true;
      textClickTimer = null;
    }, 320);
    return;
  }
  if (t === 'ai.chat') {
    if (mediaClickTimer) clearTimeout(mediaClickTimer);
    if (textClickTimer) {
      clearTimeout(textClickTimer);
      textClickTimer = null;
    }
    textSheetOpen.value = false;
    mediaSheetOpen.value = false;
    mediaClickTimer = setTimeout(() => {
      openAgentSheetFor(ev.node.id);
      mediaClickTimer = null;
    }, 200);
    return;
  }
  if (isMediaSheetType(t)) {
    // 与文本一致：延迟打开，避开双击详情 / 误触发的 move-start
    if (mediaClickTimer) clearTimeout(mediaClickTimer);
    if (textClickTimer) {
      clearTimeout(textClickTimer);
      textClickTimer = null;
    }
    textSheetOpen.value = false;
    agentSheetOpen.value = false;
    mediaClickTimer = setTimeout(() => {
      openMediaSheetFor(ev.node.id);
      mediaClickTimer = null;
    }, 320);
    return;
  }
  mediaSheetOpen.value = false;
  agentSheetOpen.value = false;
  textSheetOpen.value = false;
}

function onNodeDoubleClick(ev: NodeMouseEvent) {
  if (isWorkflowGroupNode(ev.node)) return;
  const t = String(ev.node.data?.nodeType || '');
  // 仅文本双击进编辑；图片详情改走右键菜单
  if (t !== 'input.text') return;
  if (textClickTimer) {
    clearTimeout(textClickTimer);
    textClickTimer = null;
  }
  textActionNodeId.value = ev.node.id;
  ensureNodeSelected(ev.node.id);
  textSheetOpen.value = false;
  textEditOpen.value = true;
}

function onTextEditClose() {
  textEditOpen.value = false;
  ignorePaneClickUntil = Date.now() + 400;
  const id = textActionNodeId.value || selectedId.value;
  if (id) {
    // 下一帧再选中，避开蒙层关闭时落到画布的点击
    nextTick(() => ensureNodeSelected(id));
  }
}

function onTextReplaceClose() {
  textReplaceOpen.value = false;
  ignorePaneClickUntil = Date.now() + 400;
  const id = textActionNodeId.value || selectedId.value;
  if (id) nextTick(() => ensureNodeSelected(id));
}

function closeMediaSheet() {
  mediaSheetOpen.value = false;
  agentSheetOpen.value = false;
}

function goPluginLibrary() {
  void router.push({ path: '/skills' });
}

function onPaneClick() {
  if (
    textEditOpen.value ||
    textReplaceOpen.value ||
    imageReplaceOpen.value ||
    imageDetailOpen.value
  ) {
    return;
  }
  if (Date.now() < ignorePaneClickUntil) return;
  // Agent 流式执行中：点空白不关弹层，避免「静默只剩运行中」
  if (agentLive.streaming && agentSheetOpen.value) return;
  selectedId.value = '';
  nodes.value = nodes.value.map((n: any) => (n.selected ? { ...n, selected: false } : n));
  syncGroupMemberPointerLock();
  mediaSheetOpen.value = false;
  agentSheetOpen.value = false;
  textSheetOpen.value = false;
  gridSplitSession.value = null;
  closeMenu();
  dockRef.value?.closePanels();
}

function onImageReplaceClose() {
  imageReplaceOpen.value = false;
  ignorePaneClickUntil = Date.now() + 400;
  const id = imageActionNodeId.value || selectedId.value;
  if (id) nextTick(() => ensureNodeSelected(id));
}

function onImageReplaceApply(payload: { url: string; assetId?: string }) {
  const id = imageActionNodeId.value || selectedId.value;
  if (!id || !payload.url) return;
  setParamById(id, 'url', payload.url);
  if (payload.assetId) setParamById(id, 'assetId', payload.assetId);
  const n = nodes.value.find((x: any) => x.id === id);
  if (n) {
    const data = (n.data || {}) as WorkflowFlowNodeData;
    n.data = { ...data, previewImage: payload.url, params: { ...(data.params || {}), url: payload.url } };
  }
  markDirty();
  ElMessage.success('已替换图片');
}

/** updream 派生：新建图片节点 + image 口连线（源图作参考）+ 可选立刻生图 */
async function deriveImageFromNode(
  fromId: string,
  opts: {
    label: string;
    params?: Record<string, string>;
    nodeType?: 'ai.image' | 'input.image';
    offsetX?: number;
    offsetY?: number;
    autoRun?: boolean;
    openSheet?: boolean;
    toast?: string;
    /** 自动跑时要求源节点已有图（作参考） */
    requireSourceImage?: boolean;
  },
) {
  const from = nodes.value.find((n: any) => n.id === fromId);
  if (!from) return null;
  const type = opts.nodeType || 'ai.image';
  const srcUrl = mediaUrlOfNode(from as any);
  if (opts.requireSourceImage !== false && opts.autoRun && type === 'ai.image' && !srcUrl) {
    ElMessage.warning('请先生成或上传源图，再做派生操作');
    return null;
  }
  const def = catalogMap(catalog.value).get(type);
  const { node, edge } = buildDerivedImageNode(from as any, def as any, nodes.value, {
    label: opts.label,
    params: opts.params,
    nodeType: type,
    offsetX: opts.offsetX,
    offsetY: opts.offsetY,
    referenceFromSource: true,
  });
  // 无 prompt 时无法跑 ai.image
  if (
    opts.autoRun &&
    type === 'ai.image' &&
    !String((node.data as any)?.params?.prompt || '').trim()
  ) {
    ElMessage.warning('缺少提示词，已创建节点，请补充后再生成');
    opts = { ...opts, autoRun: false, openSheet: true };
  }

  // 必须先挂节点并等 Handle 注册，再写边；否则 Vue Flow 会把线当无效边删掉
  nodes.value = [...nodes.value, node];
  markDirty();
  ensureNodeSelected(node.id);
  imageActionNodeId.value = node.id;
  await nextTick();
  try {
    updateNodeInternals([from.id, node.id]);
  } catch {
    /* ignore */
  }
  await nextTick();
  await new Promise((r) => setTimeout(r, 32));

  const styled = styleEdgeFromNodes(edge, nodes.value as any);
  const wired = { ...edge, ...styled, type: 'default' as const };
  edges.value = addEdge(wired, edges.value) as any[];
  markDirty();
  // 若仍被吃掉，再补一次
  setTimeout(() => {
    const has = (edges.value as any[]).some(
      (e) =>
        e.source === from.id &&
        e.target === node.id &&
        e.sourceHandle === 'image' &&
        e.targetHandle === 'image',
    );
    if (!has) {
      edges.value = addEdge(wired, edges.value) as any[];
      try {
        updateNodeInternals([from.id, node.id]);
      } catch {
        /* ignore */
      }
      markDirty();
    }
  }, 80);

  const willRun = Boolean(opts.autoRun && type === 'ai.image');
  // 自动跑时先别开底部条，避免挡 loading
  if (!willRun && opts.openSheet !== false && type === 'ai.image') {
    mediaSheetOpen.value = true;
    textSheetOpen.value = false;
  } else if (willRun) {
    mediaSheetOpen.value = false;
    textSheetOpen.value = false;
  }
  if (opts.toast) ElMessage.info(opts.toast);
  if (willRun) {
    // 等边补全后再跑，避免强存时漏边
    await new Promise((r) => setTimeout(r, 100));
    void runNode(node.id);
  }
  return node.id;
}

async function confirmGridSplitFromNode(fromId: string, rows: number, cols: number) {
  const from = nodes.value.find((n: any) => n.id === fromId);
  if (!from) return;
  const url = mediaUrlOfNode(from as any);
  if (!url) {
    ElMessage.warning('源节点没有可切分的图片');
    return;
  }
  const loading = ElMessage.info({ message: '正在切分…', duration: 0 });
  try {
    // 优先用节点已有本地镜像；否则经后端按 sourceUrl 复用/落盘（不重复建素材）
    const cachedLocal = String((from.data as any)?.params?.localUrl || '').trim();
    const splitSrc = isCanvasSafeImageUrl(cachedLocal)
      ? cachedLocal
      : isCanvasSafeImageUrl(url)
        ? url
        : await ensureLocalImageUrl(projectId.value, url, {
            name: String((from.data as any)?.label || 'grid-split-source'),
            workflowId: workflowId.value,
            workflowName: name.value,
          });
    if (splitSrc && isCanvasSafeImageUrl(splitSrc)) {
      const data = (from.data || {}) as WorkflowFlowNodeData;
      const params = { ...(data.params || {}) };
      if (params.localUrl !== splitSrc) {
        params.localUrl = splitSrc;
        from.data = { ...data, params };
        markDirty();
      }
    }
    // 前端裁切：紧凑缩略格 + 分组框（按裁切比例缩放到接近 updream 的体量）
    const cells = await splitImageToGrid(splitSrc, rows, cols);
    const def = catalogMap(catalog.value).get('input.image');
    const sample = cells[0];
    const { cardW: cellW, cardH: cellH, gap } = gridSplitDisplaySize(
      sample?.pixelW || 1,
      sample?.pixelH || 1,
      cols,
    );
    const gapX = gap;
    const gapY = gap;
    const fromW = Number((from as any).dimensions?.width) || Number((from.data as any)?.params?.cardW) || 372;
    const originX = from.position.x + fromW + 72;
    const originY = from.position.y;

    // 并行上传裁切块（限并发 + 失败重试），避免某格偶发坏图
    const uploadLimit = 3;
    async function uploadCell(cell: (typeof cells)[number], attempt = 0) {
      if (!cell.blob || cell.blob.size < 32) {
        throw new Error(`切分块 ${cell.index + 1} 数据无效`);
      }
      try {
        const file = new File([cell.blob], cell.filename, { type: 'image/png' });
        const asset = await uploadProjectAsset(projectId.value, file, {
          type: 'storyboard',
          name: cell.filename,
          workflowId: workflowId.value,
          workflowName: name.value,
        });
        const cellUrl = String(asset.url || '').trim();
        if (!cellUrl) throw new Error('上传未返回地址');
        return { cell, asset, cellUrl };
      } catch (err) {
        if (attempt < 2) return uploadCell(cell, attempt + 1);
        throw err;
      }
    }

    const uploaded: Array<{
      cell: (typeof cells)[number];
      asset: Awaited<ReturnType<typeof uploadProjectAsset>>;
      cellUrl: string;
    }> = [];
    for (let i = 0; i < cells.length; i += uploadLimit) {
      const chunk = cells.slice(i, i + uploadLimit);
      const part = await Promise.all(chunk.map((cell) => uploadCell(cell)));
      uploaded.push(...part);
    }

    const created: any[] = [];
    for (const { cell, asset, cellUrl } of uploaded) {
      const { node } = buildDerivedImageNode(from as any, def as any, [...nodes.value, ...created], {
        label: `${rows}x${cols}-${cell.index + 1}`,
        nodeType: 'input.image',
        params: {
          url: cellUrl,
          assetId: asset.id,
          cardW: String(cellW),
          cardH: String(cellH),
          op: 'grid-split-cell',
          aspect: '',
          mediaRev: String(Date.now() + cell.index),
        },
        offsetX: 80,
        offsetY: 0,
        referenceFromSource: false,
      });
      node.position = {
        x: originX + cell.col * (cellW + gapX),
        y: originY + cell.row * (cellH + gapY),
      };
      node.style = { width: `${cellW}px`, height: `${cellH}px` };
      node.data = {
        ...node.data,
        nodeType: node.data?.nodeType || 'input.image',
        previewImage: cellUrl,
        params: { ...(node.data as any)?.params, url: cellUrl },
      };
      created.push(node);
    }

    if (created.length !== cells.length) {
      throw new Error(`切分不完整：${created.length}/${cells.length}`);
    }

    const padX = 14;
    const padTop = 30;
    const padBottom = 12;
    const gridW = cols * cellW + (cols - 1) * gapX;
    const gridH = rows * cellH + (rows - 1) * gapY;
    const groupId = newNodeId('g');
    const groupNode = {
      id: groupId,
      type: WF_GROUP_TYPE,
      position: { x: originX - padX, y: originY - padTop },
      data: {
        title: `${rows}x${cols} 切分组`,
        color: '#50a0a0',
        imagePort: true,
        /** 源图节点，用于重载时补回连线 */
        sourceImageId: from.id,
        memberIds: created.map((n: any) => String(n.id)),
      },
      style: {
        width: `${Math.max(160, gridW + padX * 2)}px`,
        height: `${Math.max(100, gridH + padTop + padBottom)}px`,
      },
      zIndex: -10,
      selectable: true,
      draggable: true,
      connectable: true,
    };

    // 源图 → 切分组（分组左侧图片口），不再逐格拉线
    const edge = {
      id: `e_${from.id}_image_${groupId}_image`,
      source: from.id,
      sourceHandle: 'image',
      target: groupId,
      targetHandle: 'image',
    };
    const allNodes = [groupNode, ...nodes.value, ...created] as any[];
    const styled = styleEdgeFromNodes(edge, allNodes);
    const nextEdges = addEdge({ ...edge, ...styled }, edges.value as any[]) as any[];

    // 必须先挂节点并等 Handle 注册，再写边；否则 Vue Flow 会把连到分组的线当无效边删掉
    nodes.value = allNodes;
    membersTick.value += 1;
    ensureNodeSelected(groupId);
    await nextTick();
    try {
      updateNodeInternals([groupId, from.id]);
    } catch {
      /* ignore */
    }
    await nextTick();
    await new Promise((r) => setTimeout(r, 32));
    edges.value = nextEdges;
    markDirty();
    ElMessage.success(`已切分为 ${created.length} 个图片节点并分组`);
    // 若仍被吃掉，按 sourceImageId 再补一次
    setTimeout(() => {
      const has = (edges.value as any[]).some(
        (e) => e.source === from.id && e.target === groupId && e.targetHandle === 'image',
      );
      if (!has) {
        ensureSplitGroupEdges();
        try {
          updateNodeInternals([groupId, from.id]);
        } catch {
          /* ignore */
        }
        markDirty();
      } else {
        try {
          updateNodeInternals([groupId, from.id]);
        } catch {
          /* ignore */
        }
      }
    }, 80);
  } catch (e: any) {
    ElMessage.error(e?.message || '切分失败');
  } finally {
    loading.close();
    gridSplitSession.value = null;
  }
}

function getNodeRect(n: any) {
  const x = n.position?.x ?? 0;
  const y = n.position?.y ?? 0;
  // 优先读 DOM：Vue Flow dimensions / 旧 fallback 常略小于真实卡片（视频曾按 300，实际 mediocard 372）
  try {
    const id = String(n?.id || '');
    if (id) {
      const el = document.querySelector(
        `.vue-flow__node[data-id="${CSS.escape(id)}"]`,
      ) as HTMLElement | null;
      const w = el?.offsetWidth ?? 0;
      const h = el?.offsetHeight ?? 0;
      if (w > 8 && h > 8) return { x, y, w, h };
    }
  } catch {
    /* ignore */
  }

  const nodeType = String(n.data?.nodeType || n.type || '');
  const isMediaCard =
    nodeType === 'ai.video' ||
    nodeType === 'input.video' ||
    nodeType === 'ai.image' ||
    nodeType === 'input.image' ||
    nodeType === 'output.preview';
  const fallbackW =
    nodeType === 'input.text'
      ? 220
      : isMediaCard
        ? 372
        : nodeType === 'input.note'
          ? 240
          : nodeType === 'workflow-group' || n.type === WF_GROUP_TYPE
            ? 240
            : 280;
  const fallbackH =
    nodeType === 'input.text' || isMediaCard
      ? 248
      : nodeType === 'input.note'
        ? 200
        : 160;
  const customW = Number(n.data?.params?.cardW);
  const customH = Number(n.data?.params?.cardH);
  const dimW = Number(n.dimensions?.width);
  const dimH = Number(n.dimensions?.height);
  const styleW = Number.parseFloat(String((n.style as any)?.width || ''));
  const styleH = Number.parseFloat(String((n.style as any)?.height || ''));
  const w =
    (Number.isFinite(customW) && customW > 0 ? customW : 0) ||
    (Number.isFinite(dimW) && dimW > 0 ? dimW : 0) ||
    (Number.isFinite(styleW) && styleW > 0 ? styleW : 0) ||
    fallbackW;
  const h =
    (Number.isFinite(customH) && customH > 0 ? customH : 0) ||
    (Number.isFinite(dimH) && dimH > 0 ? dimH : 0) ||
    (Number.isFinite(styleH) && styleH > 0 ? styleH : 0) ||
    fallbackH;
  return {
    x,
    y,
    w: Number.isFinite(w) ? w : fallbackW,
    h: Number.isFinite(h) ? h : fallbackH,
  };
}

function rectFullyInside(
  inner: { x: number; y: number; w: number; h: number },
  outer: { x: number; y: number; w: number; h: number },
  pad = 4,
) {
  return (
    inner.x >= outer.x - pad &&
    inner.y >= outer.y - pad &&
    inner.x + inner.w <= outer.x + outer.w + pad &&
    inner.y + inner.h <= outer.y + outer.h + pad
  );
}

/** 节点中心落在分组内（含少量容差）即视为成员；比「完全包住」更稳，避免卡片略高出框就拖不动 */
function nodeBelongsToGroup(n: any, groupNode: any, pad = 12) {
  if (!n || isWorkflowGroupNode(n)) return false;
  const outer = getNodeRect(groupNode);
  const r = getNodeRect(n);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  return (
    cx >= outer.x - pad &&
    cx <= outer.x + outer.w + pad &&
    cy >= outer.y - pad &&
    cy <= outer.y + outer.h + pad
  );
}

function membersOfGroup(groupNode: any) {
  const stored = Array.isArray(groupNode?.data?.memberIds)
    ? groupNode.data.memberIds.map((x: unknown) => String(x || '').trim()).filter(Boolean)
    : [];
  if (stored.length) {
    const idSet = new Set(stored);
    const found = nodes.value.filter((n: any) => idSet.has(String(n.id)) && !isWorkflowGroupNode(n));
    if (found.length) return found;
  }
  return nodes.value.filter((n: any) => nodeBelongsToGroup(n, groupNode));
}

function syncGroupMemberIds(groupId: string, memberIds: string[]) {
  const g = nodes.value.find((n: any) => n.id === groupId);
  if (!g || !isWorkflowGroupNode(g)) return;
  const next = [...new Set(memberIds.map(String).filter(Boolean))];
  const prev = Array.isArray(g.data?.memberIds) ? g.data.memberIds.map(String) : [];
  if (prev.length === next.length && prev.every((id: string, i: number) => id === next[i])) return;
  g.data = { ...(g.data || {}), memberIds: next };
}

/**
 * 分组默认 zIndex=-10，会被成员盖住。
 * 选中时抬到上层；成员标 inert（含后代 pointer-events:none）。
 */
let syncingGroupMemberLock = false;
function syncGroupMemberPointerLock() {
  if (syncingGroupMemberLock) return;
  // 当前焦点若是组内成员，勿抬分组/inert，否则顶部 media-float 会被挡住
  const focusId = String(selectedId.value || '').trim();
  const focusNode = focusId ? nodes.value.find((n: any) => String(n.id) === focusId) : null;
  const focusIsMember = Boolean(focusNode && !isWorkflowGroupNode(focusNode));

  const locked = new Set<string>();
  for (const g of nodes.value) {
    if (!isWorkflowGroupNode(g) || !g.selected) continue;
    if (focusIsMember && membersOfGroup(g).some((m: any) => String(m.id) === focusId)) {
      continue;
    }
    for (const m of membersOfGroup(g)) locked.add(String(m.id));
  }
  let changed = false;
  const next = nodes.value.map((n: any) => {
    if (isWorkflowGroupNode(n)) {
      const coversFocus =
        focusIsMember && membersOfGroup(n).some((m: any) => String(m.id) === focusId);
      const wantZ = n.selected && !coversFocus ? 1000 : -10;
      const wantSelected = coversFocus ? false : Boolean(n.selected);
      if (n.zIndex === wantZ && Boolean(n.selected) === wantSelected) return n;
      changed = true;
      return { ...n, zIndex: wantZ, selected: wantSelected };
    }
    const isFocus = focusIsMember && String(n.id) === focusId;
    const inert = locked.has(String(n.id)) && !isFocus;
    const tokens = String(n.class || '')
      .split(/\s+/)
      .filter((c) => c && c !== 'wf-group-member-inert');
    if (inert) tokens.push('wf-group-member-inert');
    const cls = tokens.join(' ') || undefined;
    const wantDrag = !inert;
    const curDrag = n.draggable !== false;
    const needDeselect = inert && n.selected;
    const wantZ = isFocus ? 1001 : undefined;
    if (
      n.class === cls &&
      curDrag === wantDrag &&
      !needDeselect &&
      (wantZ == null || n.zIndex === wantZ)
    ) {
      return n;
    }
    changed = true;
    return {
      ...n,
      class: cls,
      draggable: wantDrag,
      selected: needDeselect ? false : n.selected,
      ...(wantZ != null ? { zIndex: wantZ } : {}),
    };
  });
  if (!changed) return;
  syncingGroupMemberLock = true;
  nodes.value = next;
  syncingGroupMemberLock = false;
}

function pointInRect(
  p: { x: number; y: number },
  r: { x: number; y: number; w: number; h: number },
  pad = 0,
) {
  return (
    p.x >= r.x - pad &&
    p.x <= r.x + r.w + pad &&
    p.y >= r.y - pad &&
    p.y <= r.y + r.h + pad
  );
}

/** 分组标题条区域（即使被节点盖住，也优先拖分组） */
function pointInGroupHeader(p: { x: number; y: number }, groupNode: any, headerH = 44) {
  const r = getNodeRect(groupNode);
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + headerH;
}

/**
 * 捕获阶段接管分组拖拽：选中后组内任意位置（含压在节点上）都能拖整组。
 * 未选中时点标题条也可直接拖分组。
 */
let customGroupDrag: {
  groupId: string;
  startClientX: number;
  startClientY: number;
  startGroupPos: { x: number; y: number };
  memberStarts: Record<string, { x: number; y: number }>;
  moved: boolean;
  undoPushed: boolean;
} | null = null;

function endCustomGroupDrag(saveAfter: boolean) {
  if (!customGroupDrag) return;
  const st = customGroupDrag;
  customGroupDrag = null;
  window.removeEventListener('pointermove', onCustomGroupPointerMove);
  window.removeEventListener('pointerup', onCustomGroupPointerUp);
  window.removeEventListener('pointercancel', onCustomGroupPointerUp);
  groupDragState.value = null;
  membersTick.value += 1;
  syncGroupMemberIds(st.groupId, Object.keys(st.memberStarts));
  if (st.moved && saveAfter) {
    markDirty();
    void save({ force: true });
  }
}

function onCustomGroupPointerMove(ev: PointerEvent) {
  const st = customGroupDrag;
  if (!st) return;
  const zoom = Number(viewport.value?.zoom) || 1;
  const dx = (ev.clientX - st.startClientX) / zoom;
  const dy = (ev.clientY - st.startClientY) / zoom;
  if (!st.moved && Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
  if (!st.undoPushed) {
    pushUndo();
    st.undoPushed = true;
  }
  st.moved = true;
  const nextGroupPos = { x: st.startGroupPos.x + dx, y: st.startGroupPos.y + dy };
  const idSet = new Set([st.groupId, ...Object.keys(st.memberStarts)]);
  nodes.value = nodes.value.map((n: any) => {
    if (!idSet.has(String(n.id))) return n;
    if (String(n.id) === st.groupId) {
      return { ...n, position: { ...nextGroupPos } };
    }
    const start = st.memberStarts[String(n.id)];
    if (!start) return n;
    return { ...n, position: { x: start.x + dx, y: start.y + dy } };
  });
}

function onCustomGroupPointerUp() {
  endCustomGroupDrag(true);
}

function onFlowGroupPointerDownCapture(ev: PointerEvent) {
  if (ev.button !== 0) return;
  if (spacePan.value || panMode.value) return;
  if (bootLoading.value) return;
  const t = ev.target as HTMLElement | null;
  if (!t) return;
  // 分组/节点浮层工具条、连线桩、表单：绝不抢走
  // （节点上方 media-float 常落在分组「标题条」44px 热区内，否则一点操作栏就被当成拖分组）
  if (
    t.closest(
      '.vue-flow__handle, .group-float, .media-float, .text-float, .vue-flow__minimap, .vue-flow__controls, .canvas-dock, input, textarea, select, a, [contenteditable="true"]',
    )
  ) {
    return;
  }

  let flowPos: { x: number; y: number };
  try {
    flowPos = screenToFlowCoordinate({ x: ev.clientX, y: ev.clientY });
  } catch {
    return;
  }

  const groups = nodes.value.filter((n: any) => isWorkflowGroupNode(n));
  if (!groups.length) return;

  // 1) 已选中且点在组内 → 拖整组（哪怕点在成员节点上）
  let group =
    groups.find((g: any) => g.selected && pointInRect(flowPos, getNodeRect(g))) || null;

  // 2) 未选中：点在标题条（含被节点盖住）→ 也拖整组
  if (!group) {
    group = groups.find((g: any) => pointInGroupHeader(flowPos, g)) || null;
  }

  // 3) 直接点在分组节点 DOM 上
  if (!group) {
    const groupEl = t.closest('.vue-flow__node-wfGroup') as HTMLElement | null;
    const gid = groupEl?.getAttribute('data-id') || '';
    if (gid) group = groups.find((g: any) => g.id === gid) || null;
  }

  // 4) 点在某成员上，且该成员属于某个分组：若该分组已选中则拖整组
  if (!group) {
    const nodeEl = t.closest('.vue-flow__node') as HTMLElement | null;
    const nid = nodeEl?.getAttribute('data-id') || '';
    if (nid && nodeEl && !nodeEl.classList.contains('vue-flow__node-wfGroup')) {
      group =
        groups.find(
          (g: any) =>
            g.selected && membersOfGroup(g).some((m: any) => String(m.id) === nid),
        ) || null;
    }
  }

  if (!group) return;

  // 未选中且点在组内成员上、又不在标题条：交给节点自己拖
  if (!group.selected && !pointInGroupHeader(flowPos, group)) {
    const nodeEl = t.closest('.vue-flow__node') as HTMLElement | null;
    if (nodeEl && !nodeEl.classList.contains('vue-flow__node-wfGroup')) {
      return;
    }
  }

  ev.preventDefault();
  ev.stopImmediatePropagation();

  ensureNodeSelected(String(group.id));

  const gNow = nodes.value.find((n: any) => n.id === group!.id) || group;
  const members = membersOfGroup(gNow);
  const memberStarts: Record<string, { x: number; y: number }> = {};
  for (const m of members) {
    memberStarts[String(m.id)] = {
      x: Number(m.position?.x) || 0,
      y: Number(m.position?.y) || 0,
    };
  }
  syncGroupMemberIds(
    String(gNow.id),
    members.map((m: any) => String(m.id)),
  );

  customGroupDrag = {
    groupId: String(gNow.id),
    startClientX: ev.clientX,
    startClientY: ev.clientY,
    startGroupPos: {
      x: Number(gNow.position?.x) || 0,
      y: Number(gNow.position?.y) || 0,
    },
    memberStarts,
    moved: false,
    undoPushed: false,
  };
  groupDragState.value = {
    groupId: String(gNow.id),
    memberIds: Object.keys(memberStarts),
    startGroupPos: { ...customGroupDrag.startGroupPos },
    memberStarts: { ...memberStarts },
  };

  window.addEventListener('pointermove', onCustomGroupPointerMove);
  window.addEventListener('pointerup', onCustomGroupPointerUp);
  window.addEventListener('pointercancel', onCustomGroupPointerUp);
}

/** 补回「源图 → 切分组」连线（旧图缺线 / Handle 未就绪时丢失） */
function ensureSplitGroupEdges(): boolean {
  let changed = false;
  const idSet = new Set(nodes.value.map((n: any) => String(n.id)));
  const next = [...(edges.value as any[])];

  for (const g of nodes.value as any[]) {
    if (!isWorkflowGroupNode(g)) continue;
    const data = (g.data || {}) as { title?: string; imagePort?: boolean; sourceImageId?: string };
    const isSplit = Boolean(data.imagePort) || /切分组/.test(String(data.title || ''));
    if (!isSplit) continue;
    if (next.some((e) => e.target === g.id && e.targetHandle === 'image')) continue;

    let srcId = String(data.sourceImageId || '').trim();
    if (!srcId || !idSet.has(srcId)) {
      const gr = getNodeRect(g);
      const gy = gr.y + gr.h / 2;
      let best: { id: string; dist: number } | null = null;
      for (const n of nodes.value as any[]) {
        if (isWorkflowGroupNode(n)) continue;
        const t = String(n.data?.nodeType || '');
        if (t !== 'input.image' && t !== 'ai.image' && t !== 'output.preview') continue;
        // 跳过组内切分小格
        if (String(n.data?.params?.op || '') === 'grid-split-cell') continue;
        const nr = getNodeRect(n);
        if (nr.x + nr.w > gr.x + 12) continue;
        const dist = Math.hypot(gr.x - (nr.x + nr.w), gy - (nr.y + nr.h / 2));
        if (!best || dist < best.dist) best = { id: String(n.id), dist };
      }
      srcId = best?.id || '';
    }
    if (!srcId || !idSet.has(srcId)) continue;

    const edge = {
      id: `e_${srcId}_image_${g.id}_image`,
      source: srcId,
      sourceHandle: 'image',
      target: g.id,
      targetHandle: 'image',
    };
    const styled = styleEdgeFromNodes(edge, nodes.value as any);
    next.push({ ...edge, ...styled });
    if (String(data.sourceImageId || '') !== srcId) {
      g.data = { ...data, imagePort: true, sourceImageId: srcId };
    }
    changed = true;
  }

  if (changed) edges.value = next as any;
  return changed;
}

/**
 * 分组框若偏小（模板估算不准 / 媒体卡变高），向右下撑开以包住中心落在框内的节点，避免右边「露馅」。
 * 只放大不缩小。
 */
function expandGroupsToFitMembers() {
  let changed = false;
  const resizedIds: string[] = [];
  nodes.value = nodes.value.map((gNode: any) => {
    if (!isWorkflowGroupNode(gNode)) return gNode;
    const outer = getNodeRect(gNode);
    const members = nodes.value.filter((n: any) => {
      if (isWorkflowGroupNode(n)) return false;
      if (String(n.data?.nodeType || '') === 'input.note') return false;
      const r = getNodeRect(n);
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      // 中心落在原分组附近，即视为该分组的成员
      return (
        cx >= outer.x - 24 &&
        cx <= outer.x + outer.w + 24 &&
        cy >= outer.y - 24 &&
        cy <= outer.y + outer.h + 24
      );
    });
    if (!members.length) return gNode;
    const padX = 56;
    const padTop = 52;
    const padBottom = 44;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of members) {
      const r = getNodeRect(n);
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w);
      maxY = Math.max(maxY, r.y + r.h);
    }
    const needX = minX - padX;
    const needY = minY - padTop;
    const needR = maxX + padX;
    const needB = maxY + padBottom;
    const nx = Math.min(outer.x, needX);
    const ny = Math.min(outer.y, needY);
    const nr = Math.max(outer.x + outer.w, needR);
    const nb = Math.max(outer.y + outer.h, needB);
    if (
      Math.abs(nx - outer.x) < 1 &&
      Math.abs(ny - outer.y) < 1 &&
      Math.abs(nr - (outer.x + outer.w)) < 1 &&
      Math.abs(nb - (outer.y + outer.h)) < 1
    ) {
      return gNode;
    }
    changed = true;
    resizedIds.push(String(gNode.id));
    return {
      ...gNode,
      position: { x: nx, y: ny },
      style: {
        ...(gNode.style || {}),
        width: `${Math.max(160, nr - nx)}px`,
        height: `${Math.max(100, nb - ny)}px`,
      },
    };
  });
  if (resizedIds.length) {
    setTimeout(() => {
      try {
        updateNodeInternals(resizedIds);
      } catch {
        /* ignore */
      }
    }, 60);
  }
  return changed;
}

const nodeDragOrigin = ref<{ id: string; x: number; y: number } | null>(null);

/** 分组拖拽：成员相对拖拽起点做绝对位移，避免增量 dx 丢帧/与吸附不同步 */
function applyGroupMemberFollow(groupPos: { x: number; y: number }) {
  const st = groupDragState.value;
  if (!st?.memberIds.length) return;
  const dx = groupPos.x - st.startGroupPos.x;
  const dy = groupPos.y - st.startGroupPos.y;
  const idSet = new Set(st.memberIds);
  nodes.value = nodes.value.map((n: any) => {
    if (!idSet.has(String(n.id))) return n;
    const start = st.memberStarts[String(n.id)];
    if (!start) return n;
    const nx = start.x + dx;
    const ny = start.y + dy;
    if (
      Math.abs(Number(n.position?.x) - nx) < 0.01 &&
      Math.abs(Number(n.position?.y) - ny) < 0.01
    ) {
      return n;
    }
    return { ...n, position: { x: nx, y: ny } };
  });
}

function onNodeDragStart(ev: NodeDragEvent) {
  nodeDragOrigin.value = {
    id: ev.node.id,
    x: ev.node.position.x,
    y: ev.node.position.y,
  };
  // 轻微拖动才收起底部条；纯点击的微抖不动条
  pushUndo();
  if (!isWorkflowGroupNode(ev.node)) {
    groupDragState.value = null;
    return;
  }
  const members = membersOfGroup(ev.node);
  const memberIds = members.map((n: any) => String(n.id));
  const memberStarts: Record<string, { x: number; y: number }> = {};
  for (const m of members) {
    memberStarts[String(m.id)] = {
      x: Number(m.position?.x) || 0,
      y: Number(m.position?.y) || 0,
    };
  }
  syncGroupMemberIds(String(ev.node.id), memberIds);
  groupDragState.value = {
    groupId: String(ev.node.id),
    memberIds,
    startGroupPos: { x: ev.node.position.x, y: ev.node.position.y },
    memberStarts,
  };
}

function onNodeDrag(ev: NodeDragEvent) {
  const origin = nodeDragOrigin.value;
  if (origin && origin.id === ev.node.id) {
    const moved =
      Math.abs(ev.node.position.x - origin.x) > 3 || Math.abs(ev.node.position.y - origin.y) > 3;
    if (moved) {
      // 拖动时弹层跟随节点，不强制关闭
      if (mediaSheetOpen.value) updateMediaSheetAnchor();
      if (textSheetOpen.value) updateTextSheetAnchor();
      // 流式中拖节点不关 Agent 弹层，过程继续可见；同步贴靠位置
      if (agentSheetOpen.value) {
        if (!agentLive.streaming) agentSheetOpen.value = false;
        else updateAgentSheetAnchor();
      }
    }
  }
  const st = groupDragState.value;
  if (!st || st.groupId !== ev.node.id) return;
  applyGroupMemberFollow(ev.node.position);
}

function onNodeDragStop(ev: NodeDragEvent) {
  const origin = nodeDragOrigin.value;
  nodeDragOrigin.value = null;
  alignGuideH.value = undefined;
  alignGuideV.value = undefined;
  membersTick.value += 1;
  // 以拖拽事件的最终坐标为准写入模型，再强制落盘（避免受控更新时序导致存到旧位置）
  const dragId = String(ev.node?.id || '');
  const finalPos = ev.node?.position;
  if (dragId && finalPos && Number.isFinite(finalPos.x) && Number.isFinite(finalPos.y)) {
    const cur = nodes.value.find((n: any) => n.id === dragId);
    if (
      cur &&
      (Math.abs(Number(cur.position?.x) - finalPos.x) > 0.01 ||
        Math.abs(Number(cur.position?.y) - finalPos.y) > 0.01)
    ) {
      nodes.value = nodes.value.map((n: any) =>
        n.id === dragId ? { ...n, position: { x: finalPos.x, y: finalPos.y } } : n,
      );
    }
    // 松手前再跟一次成员，避免最后一帧只更新了分组框
    if (groupDragState.value?.groupId === dragId) {
      applyGroupMemberFollow({ x: finalPos.x, y: finalPos.y });
      syncGroupMemberIds(dragId, groupDragState.value.memberIds);
    }
  }
  groupDragState.value = null;
  markDirty();
  void save({ force: true });
  // 近似点击（几乎没拖动）时补开底部条
  if (origin && origin.id === ev.node.id) {
    const moved =
      Math.abs(ev.node.position.x - origin.x) > 3 || Math.abs(ev.node.position.y - origin.y) > 3;
    if (!moved) {
      const t = String(ev.node.data?.nodeType || '');
      if (t === 'ai.chat') openAgentSheetFor(ev.node.id);
      else if (isMediaSheetType(t) && !imageDetailOpen.value) {
        openMediaSheetFor(ev.node.id);
      }
    }
  }
}

function onSelectionEnd() {
  syncGroupMemberPointerLock();
  const sel = nodes.value.filter((n: any) => n.selected && !isWorkflowGroupNode(n));
  const selGroup = nodes.value.find((n: any) => n.selected && isWorkflowGroupNode(n));
  selectedId.value = sel[0]?.id || selGroup?.id || '';
  if (selectedId.value && sel[0]) {
    const t = String(sel[0]?.data?.nodeType || '');
    if (t === 'ai.chat') {
      ignoreSheetCloseUntil = Date.now() + 400;
      openAgentSheetFor(selectedId.value);
    } else if (isMediaSheetType(t)) {
      ignoreSheetCloseUntil = Date.now() + 400;
      mediaSheetOpen.value = true;
      agentSheetOpen.value = false;
      textSheetOpen.value = false;
    }
  } else if (Date.now() >= ignoreSheetCloseUntil) {
    mediaSheetOpen.value = false;
    agentSheetOpen.value = false;
  }
}

function onCanvasMoveStart() {
  // 平移/缩放时收起底部条；刚点选节点后短时忽略（Vue Flow 选中时常会误触发 move-start）
  if (Date.now() < ignoreSheetCloseUntil) return;
  mediaSheetOpen.value = false;
  agentSheetOpen.value = false;
  textSheetOpen.value = false;
}

function onCanvasMoveEnd() {
  if (suppressDirty.value || bootLoading.value) return;
  // 平移/缩放也要落盘，否则单 Agent 刷新后又被 fit 回中心，看起来像位置没存
  markDirty();
}

function clientXY(event: Event | { clientX?: number; clientY?: number }) {
  const e = event as MouseEvent & { touches?: TouchList };
  if (typeof e.clientX === 'number' && typeof e.clientY === 'number') {
    return { x: e.clientX, y: e.clientY };
  }
  const t = e.touches?.[0];
  return { x: t?.clientX ?? 0, y: t?.clientY ?? 0 };
}

function flowPosFromClient(x: number, y: number) {
  try {
    return screenToFlowCoordinate({ x, y });
  } catch {
    return { ...dropPos.value };
  }
}

function openAddMenu(event: MouseEvent) {
  event.preventDefault();
  const { x, y } = clientXY(event);
  dropPos.value = flowPosFromClient(x, y);
  closeMenu();
  dockRef.value?.closePanels();
  addPalette.x = Math.min(x, window.innerWidth - 180);
  addPalette.y = Math.min(y, window.innerHeight - 420);
  addPalette.open = true;
}

function openDockAddMenu() {
  dockRef.value?.closePanels();
  closeMenu();
  const wrap = document.querySelector('.flow-wrap') as HTMLElement | null;
  const rect = wrap?.getBoundingClientRect();
  const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
  dropPos.value = flowPosFromClient(cx, cy);
  addPalette.x = undefined;
  addPalette.y = undefined;
  addPalette.open = true;
}

function onAddPalettePick(type: string) {
  addNode(type, dropPos.value);
}

function fitCanvas() {
  try {
    fitView({ padding: 0.2, duration: 280 });
  } catch {
    /* ignore */
  }
}

/** 初始/进入：有存档视口则恢复，否则居中并固定 100% */
function fitCanvasDefault() {
  try {
    if (!nodes.value.length) {
      void setViewport({ x: 0, y: 0, zoom: DEFAULT_ZOOM }, { duration: 0 });
      return;
    }
    if (pendingBootViewport) {
      const saved = pendingBootViewport;
      pendingBootViewport = null;
      void setViewport(saved, { duration: 0 });
      bootViewportRestored = true;
      return;
    }
    if (bootViewportRestored) return;
    void fitView({
      padding: 0.22,
      minZoom: DEFAULT_ZOOM,
      maxZoom: DEFAULT_ZOOM,
      duration: 0,
    });
  } catch {
    /* ignore */
  }
}

function waitFrames(n = 2) {
  return new Promise<void>((resolve) => {
    const step = (left: number) => {
      if (left <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(() => step(left - 1));
    };
    step(n);
  });
}

/** 等节点量完尺寸后再 fit，避免揭开蒙版时再错位一帧 */
async function settleCanvasViewport() {
  bootViewportRestored = false;
  await nextTick();
  await waitFrames(2);
  try {
    updateNodeInternals(nodes.value.map((n) => n.id));
  } catch {
    /* ignore */
  }
  expandGroupsToFitMembers();
  await nextTick();
  fitCanvasDefault();
  if (bootViewportRestored) return;
  await waitFrames(2);
  fitCanvasDefault();
  // 媒体卡高度落地后再稳一次
  await new Promise((r) => setTimeout(r, 80));
  fitCanvasDefault();
}

function zoomInCanvas() {
  try {
    zoomIn({ duration: 160 });
  } catch {
    /* ignore */
  }
}

function zoomOutCanvas() {
  try {
    zoomOut({ duration: 160 });
  } catch {
    /* ignore */
  }
}

function openLibrary(
  kind: 'styles' | 'shots' | 'characters',
  mode: LibraryApplyMode = 'auto',
) {
  const map: Record<typeof kind, LibraryKind> = {
    styles: 'style',
    shots: 'shot',
    characters: 'character',
  };
  libraryTab.value = map[kind];
  libraryApplyMode.value = mode;
  libraryOpen.value = true;
  dockRef.value?.closePanels();
}

function openScriptGenerator() {
  scriptGenOpen.value = true;
  dockRef.value?.closePanels();
  closeMenu();
}

function openLibraryFromScript(kind: LibraryKind) {
  scriptGenOpen.value = false;
  libraryTab.value = kind;
  libraryApplyMode.value = 'script';
  libraryOpen.value = true;
}

/** 把文案写进生图 / 视频 / 对话节点的 params.prompt */
function appendPromptToNode(node: any, text: string) {
  if (!node || !text.trim()) return null as any;
  const t = String(node.data?.nodeType || '');
  if (t !== 'ai.image' && t !== 'ai.video' && t !== 'ai.chat') return null;
  const data = (node.data || {}) as WorkflowFlowNodeData;
  const prev = String(data.params?.prompt || '').trim();
  const next = prev ? `${prev}\n${text}` : text;
  node.data = {
    ...data,
    params: { ...(data.params || {}), prompt: next },
  };
  return node;
}

function findOrCreateNode(type: string, label = '', position?: { x: number; y: number }) {
  const existing = nodes.value.find((n: any) => String(n.data?.nodeType || '') === type);
  if (existing) return existing;
  const def = catalogMap(catalog.value).get(type);
  if (!def) return null;
  const id = newNodeId('n');
  const pos = position || { ...dropPos.value };
  const blankMedia = type === 'ai.image' || type === 'ai.video';
  nodes.value = [
    ...nodes.value,
    {
      id,
      type: 'workflow',
      position: pos,
      data: {
        label: blankMedia ? '' : label || def.title,
        nodeType: type,
        params: { ...(def.defaultParams || {}) },
        catalog: def,
      } satisfies WorkflowFlowNodeData,
    },
  ];
  markDirty();
  return nodes.value.find((n) => n.id === id)!;
}

function ensureImageVideoEdge(imageId: string, videoId: string, targetHandle = 'image') {
  const th = targetHandle === 'endImage' ? 'endImage' : 'image';
  const exists = edges.value.some(
    (e: any) =>
      e.source === imageId &&
      e.target === videoId &&
      String(e.sourceHandle || '') === 'image' &&
      String(e.targetHandle || '') === th,
  );
  if (exists) {
    syncAiVideoRefMode(videoId, 'edges');
    return;
  }
  const styled = styleEdgeFromNodes(
    {
      source: imageId,
      target: videoId,
      sourceHandle: 'image',
      targetHandle: th,
    } as any,
    nodes.value,
  );
  edges.value = [
    ...edges.value,
    {
      id: `e_${imageId}_image_${videoId}_${th}`,
      source: imageId,
      target: videoId,
      sourceHandle: 'image',
      targetHandle: th,
      ...styled,
      type: 'default',
      animated: false,
    },
  ];
  markDirty();
  syncAiVideoRefMode(videoId, 'edges');
}

function ensureVideoVideoEdge(videoSrcId: string, videoTargetId: string) {
  const exists = edges.value.some(
    (e: any) =>
      e.source === videoSrcId &&
      e.target === videoTargetId &&
      String(e.sourceHandle || '') === 'video' &&
      String(e.targetHandle || '') === 'video',
  );
  if (exists) {
    syncAiVideoRefMode(videoTargetId, 'edges');
    return;
  }
  const styled = styleEdgeFromNodes(
    {
      source: videoSrcId,
      target: videoTargetId,
      sourceHandle: 'video',
      targetHandle: 'video',
    } as any,
    nodes.value,
  );
  edges.value = [
    ...edges.value,
    {
      id: `e_${videoSrcId}_video_${videoTargetId}_video`,
      source: videoSrcId,
      target: videoTargetId,
      sourceHandle: 'video',
      targetHandle: 'video',
      ...styled,
      type: 'default',
      animated: false,
    },
  ];
  markDirty();
  syncAiVideoRefMode(videoTargetId, 'edges');
}

function countInboundEndImage(nodeId: string) {
  return (edges.value as any[]).filter(
    (e) => e.target === nodeId && String(e.targetHandle || '') === 'endImage',
  ).length;
}

function countInboundVideoRefs(nodeId: string) {
  return (edges.value as any[]).filter(
    (e) => e.target === nodeId && String(e.targetHandle || '') === 'video',
  ).length;
}

/** 向 ai.image / ai.video 追加参考：落成上游节点并连线，避免覆盖 referenceImage */
function attachMediaRefToAiNode(nodeId: string, asset: HistoryAsset): boolean {
  const n = nodes.value.find((x: any) => x.id === nodeId);
  if (!n || !asset.url) return false;
  const data = (n.data || {}) as WorkflowFlowNodeData;
  const t = String(data.nodeType || '');
  if (t !== 'ai.image' && t !== 'ai.video') return false;

  const isVid =
    isLikelyVideoUrl(asset.url) || /video/i.test(String(asset.type || ''));
  if (t === 'ai.image' && isVid) {
    ElMessage.warning('图片节点仅支持参考图');
    return false;
  }

  const refMode = String(data.params?.refMode || '').trim().toLowerCase();
  const framesMode =
    t === 'ai.video' && (refMode === 'frames' || refMode === '首尾帧');

  const imageCount = collectInboundMediaRefs(nodeId, { max: 9 }).length;
  const videoCount = countInboundVideoRefs(nodeId);
  const endCount = countInboundEndImage(nodeId);
  const legacyRef = String(data.params?.referenceImage || '').trim();
  /** 旧单字段参考图：计入数量，追加前先落成连线，避免被清空丢失 */
  const effectiveImageCount = imageCount + (legacyRef && imageCount === 0 ? 1 : 0);

  if (framesMode) {
    if (isVid) {
      ElMessage.warning('首尾帧模式请上传图片');
      return false;
    }
    if (effectiveImageCount + endCount >= 2) {
      ElMessage.warning('首尾帧最多 2 张（首帧 + 尾帧）');
      return false;
    }
  } else if (isVid) {
    if (videoCount >= 3) {
      ElMessage.warning('全能参考最多 3 段参考视频');
      return false;
    }
  } else if (effectiveImageCount >= 9) {
    ElMessage.warning('最多 9 张参考图');
    return false;
  }

  const promoteLegacy = async () => {
    if (!legacyRef || imageCount > 0) return;
    const legacyType = 'input.image';
    const legacyDef = catalogMap(catalog.value).get(legacyType);
    const legacyId = newNodeId('n');
    const ax0 = Number(n.position?.x || 0);
    const ay0 = Number(n.position?.y || 0);
    nodes.value = [
      ...nodes.value,
      {
        id: legacyId,
        type: 'workflow',
        position: { x: ax0 - 300, y: ay0 },
        data: {
          label: '参考图',
          nodeType: legacyType,
          params: {
            ...(legacyDef?.defaultParams || {}),
            url: legacyRef,
          },
          catalog: legacyDef,
          previewImage: legacyRef,
        } satisfies WorkflowFlowNodeData,
      },
    ];
    await nextTick();
    try {
      updateNodeInternals([legacyId, nodeId]);
    } catch {
      /* ignore */
    }
    await nextTick();
    await new Promise((r) => setTimeout(r, 40));
    if (framesMode) {
      ensureImageVideoEdge(legacyId, nodeId, 'image');
    } else {
      ensureImageVideoEdge(legacyId, nodeId, 'image');
    }
    setParamById(nodeId, 'referenceImage', '');
  };

  const nodeType = isVid ? 'input.video' : 'input.image';
  const def = catalogMap(catalog.value).get(nodeType);
  const mediaId = newNodeId('n');
  const ax = Number(n.position?.x || 0);
  const ay = Number(n.position?.y || 0);
  const stack = effectiveImageCount + videoCount + endCount;
  nodes.value = [
    ...nodes.value,
    {
      id: mediaId,
      type: 'workflow',
      position: { x: ax - 300, y: ay + stack * 48 },
      data: {
        label: asset.name || (isVid ? '参考视频' : '参考图'),
        nodeType,
        params: {
          ...(def?.defaultParams || {}),
          url: asset.url,
          assetId: asset.id,
          name: asset.name || '',
          ...(isVid && assetPosterUrl(asset) ? { posterUrl: assetPosterUrl(asset) } : {}),
        },
        catalog: def,
        previewImage: isVid ? assetPosterUrl(asset) : asset.url,
        previewVideo: isVid ? asset.url : '',
      } satisfies WorkflowFlowNodeData,
    },
  ];

  void (async () => {
    await promoteLegacy();
    await nextTick();
    try {
      updateNodeInternals([mediaId, nodeId]);
    } catch {
      /* ignore */
    }
    await nextTick();
    await new Promise((r) => setTimeout(r, 40));
    if (isVid) {
      ensureVideoVideoEdge(mediaId, nodeId);
    } else if (framesMode) {
      const hasStart = (edges.value as any[]).some(
        (e) => e.target === nodeId && String(e.targetHandle || 'image') === 'image',
      );
      ensureImageVideoEdge(mediaId, nodeId, hasStart ? 'endImage' : 'image');
    } else {
      ensureImageVideoEdge(mediaId, nodeId, 'image');
    }
    if (String((nodes.value.find((x: any) => x.id === nodeId)?.data as WorkflowFlowNodeData)?.params?.referenceImage || '').trim()) {
      setParamById(nodeId, 'referenceImage', '');
    }
    try {
      updateNodeInternals([mediaId, nodeId]);
    } catch {
      /* ignore */
    }
  })();

  ElMessage.success(isVid ? '已添加参考视频' : '已添加参考图');
  return true;
}

function imagePromptFromScript(scriptText: string, styleBrief: string) {
  const shots = parseScriptShots(scriptText).map((s) => s.line);
  const pick = (shots[0] || scriptText).slice(0, 480);
  return [styleBrief.trim(), pick].filter(Boolean).join('\n');
}

function createFreshNode(
  type: string,
  opts: {
    label?: string;
    params?: Record<string, unknown>;
    position: { x: number; y: number };
  },
) {
  const def = catalogMap(catalog.value).get(type);
  if (!def) return null;
  const id = newNodeId('n');
  const blankMedia = type === 'ai.image' || type === 'ai.video';
  const params = { ...(def.defaultParams || {}), ...(opts.params || {}) };
  nodes.value = [
    ...nodes.value,
    {
      id,
      type: 'workflow',
      position: opts.position,
      data: {
        label: opts.label ?? (blankMedia ? '' : def.title),
        nodeType: type,
        params,
        catalog: def,
      } satisfies WorkflowFlowNodeData,
    },
  ];
  markDirty();
  return nodes.value.find((n) => n.id === id)!;
}

function onApplyLibrary(raw: Record<string, unknown>) {
  const payload = raw as {
    text: string;
    label: string;
    kind: LibraryKind;
    id?: string;
    shotId?: string;
    category?: string;
    tags?: string[];
    subStyle?: string;
    durationSec?: number;
  };
  libraryOpen.value = false;
  const mode = libraryApplyMode.value;

  const toScript =
    mode === 'script' ||
    (mode === 'auto' &&
      (payload.kind === 'style' || payload.kind === 'character' || payload.kind === 'shot'));

  if (toScript) {
    if (payload.kind === 'style') {
      scriptCtx.styleLabel = payload.label;
      scriptCtx.styleBrief = payload.text;
    }
    if (payload.kind === 'character') {
      scriptCtx.characterLabel = payload.label;
      scriptCtx.characterBrief = payload.text;
      scriptCtx.mode = 'character';
      scriptCtx.initialPrompt = '';
      scriptCtx.shotId = '';
    }
    if (payload.kind === 'shot') {
      scriptCtx.shotLabel = payload.label;
      scriptCtx.shotBrief = payload.text;
      scriptCtx.shotId = String(payload.shotId || payload.id || '');
      scriptCtx.category = String(payload.category || '');
      const tags = Array.isArray(payload.tags)
        ? payload.tags.map((t) => String(t || '').trim()).filter(Boolean)
        : [];
      scriptCtx.tags = tags;
      scriptCtx.subStyle =
        String(payload.subStyle || '').trim() ||
        tags.find((t) => t && t !== '画风' && t !== '动漫风') ||
        '';
      scriptCtx.durationSec = Number(payload.durationSec) === 15 ? 15 : 10;
      scriptCtx.mode = 'shot';
      scriptCtx.initialPrompt = payload.text;
    }
    scriptGenOpen.value = true;
      const tip =
      payload.kind === 'shot'
        ? `已带入镜头「${payload.label}」到脚本生成器，将扩写定妆+场景+三关键帧+一条成片`
        : payload.kind === 'character'
          ? `已带入角色「${payload.label}」到脚本生成器`
          : `已带入风格「${payload.label}」到脚本生成器`;
    ElMessage.success(tip);
    libraryApplyMode.value = 'auto';
    return;
  }

  let preferTypes =
    payload.kind === 'shot'
      ? ['ai.video', 'ai.image']
      : selectedData.value?.nodeType === 'ai.video'
        ? ['ai.video', 'ai.image']
        : ['ai.image', 'ai.video'];

  if (mode === 'node-prompt' && selectedData.value) {
    const t = selectedData.value.nodeType;
    if (t === 'ai.image' || t === 'ai.video' || t === 'ai.chat') {
      preferTypes = [t];
    }
  }

  let target =
    selectedId.value &&
    nodes.value.find((n: any) => {
      if (n.id !== selectedId.value) return false;
      return preferTypes.includes(String(n.data?.nodeType || ''));
    });

  if (!target) {
    target = nodes.value.find((n: any) => preferTypes.includes(String(n.data?.nodeType || '')));
  }

  if (!target) {
    const createType = preferTypes[0] || 'ai.image';
    target = createFreshNode(createType, {
      label: '',
      params: { prompt: payload.text },
      position: { ...dropPos.value },
    });
    if (target) {
      selectedId.value = target.id;
      mediaSheetOpen.value = createType === 'ai.image' || createType === 'ai.video';
      markDirty();
      libraryApplyMode.value = 'auto';
      ElMessage.success('已写入新节点的提示词');
      return;
    }
  }

  if (!target) {
    ElMessage.warning('请先选中或添加一个生图/视频节点');
    libraryApplyMode.value = 'auto';
    return;
  }

  const written = appendPromptToNode(target, payload.text);
  selectedId.value = (written || target).id;
  mediaSheetOpen.value = true;
  markDirty();
  libraryApplyMode.value = 'auto';
  ElMessage.success('已写入提示词');
}

function onScriptGeneratorConfirm(payload: {
  mode: ScriptGenMode;
  prompt: string;
  model: string;
  styleLabel: string;
  styleBrief: string;
  characterLabel: string;
  characterBrief: string;
  shotLabel: string;
  shotBrief: string;
  shotId: string;
  category: string;
  subStyle: string;
  tags: string[];
  targetDurationSec: 10 | 15;
}) {
  scriptGenOpen.value = false;
  // 带着当前画布图进后台，避免未保存改动被服务端旧图覆盖；离页后也不会 abort
  void scriptGenStore.start({
    workflowId: workflowId.value,
    workflowName: name.value,
    mode: payload.mode,
    prompt: payload.prompt,
    model: payload.model,
    styleLabel: payload.styleLabel || scriptCtx.styleLabel,
    styleBrief: payload.styleBrief || scriptCtx.styleBrief,
    characterLabel: payload.characterLabel || scriptCtx.characterLabel,
    characterBrief: payload.characterBrief || scriptCtx.characterBrief,
    shotLabel: payload.shotLabel || scriptCtx.shotLabel,
    shotBrief: payload.shotBrief || scriptCtx.shotBrief,
    shotId: payload.shotId || scriptCtx.shotId,
    category: payload.category || scriptCtx.category,
    subStyle: payload.subStyle || scriptCtx.subStyle,
    tags: payload.tags?.length ? payload.tags : scriptCtx.tags,
    targetDurationSec: payload.targetDurationSec === 15 ? 15 : 10,
    liveGraph: flowToGraph(nodes.value, edges.value, readFlowViewport()),
  });
}

function applyScriptGenResult(graph: import('@ai-video-studio/shared').WorkflowDocument) {
  suppressDirty.value = true;
  const flow = graphToFlow(graph, catalog.value);
  nodes.value = flow.nodes;
  edges.value = flow.edges;
  dirty.value = false;
  void nextTick(() => {
    expandGroupsToFitMembers();
    try {
      fitView({ padding: 0.18, maxZoom: DEFAULT_ZOOM, duration: 360 });
    } catch {
      /* ignore */
    }
    suppressDirty.value = false;
  });
}

function createGroupFrame(opts: {
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
}) {
  const color =
    opts.color ||
    GROUP_COLORS[nodes.value.filter((n: any) => isWorkflowGroupNode(n)).length % GROUP_COLORS.length];
  const id = newNodeId('g');
  nodes.value = [
    {
      id,
      type: WF_GROUP_TYPE,
      position: { x: opts.x, y: opts.y },
      data: { title: opts.title, color, imagePort: true },
      style: {
        width: `${Math.max(160, opts.width)}px`,
        height: `${Math.max(100, opts.height)}px`,
      },
      zIndex: -10,
      selectable: true,
      draggable: true,
      connectable: true,
    },
    ...nodes.value,
  ];
  return id;
}

function focusDockNode(id: string) {
  selectedId.value = id;
  const n = nodes.value.find((x: any) => x.id === id);
  const t = String(n?.data?.nodeType || '');
  mediaSheetOpen.value = t === 'ai.image' || t === 'ai.video';
  if (!n) return;
  try {
    fitView({ nodes: [id], padding: 0.45, duration: 280 });
  } catch {
    /* ignore */
  }
}

function focusPaletteAssets(scope: 'canvas' | 'global' = 'canvas') {
  libraryOpen.value = false;
  historyOpen.value = false;
  paletteRef.value?.openAssets(scope);
  paletteOpen.value = true;
  ElMessage.info('从左侧媒体面板拖到画布或节点');
}

function onInspectorPickAsset(kind: 'image' | 'video' = 'image') {
  const t = selectedData.value?.nodeType;
  pendingRefPick.value =
    t === 'ai.image' || t === 'ai.video' || t === 'ai.chat' || t === 'input.text';
  pendingRefMediaKind.value = kind === 'video' ? 'video' : 'image';
  pendingFillNodeId.value = selectedId.value || '';
  if (pendingRefPick.value && (t === 'ai.image' || t === 'ai.video')) {
    void uploadMediaOrRef(true, pendingRefMediaKind.value);
    return;
  }
  focusPaletteAssets(pendingRefPick.value ? 'global' : 'canvas');
}

function placeAssetOnCanvas(asset: HistoryAsset, flowPos?: { x: number; y: number }) {
  if (!asset.url) {
    ElMessage.warning('该资产没有可用地址');
    return;
  }

  const fillId = pendingFillNodeId.value || (pendingRefPick.value ? selectedId.value : '');
  if (fillId && applyAssetToNode(fillId, asset)) {
    // 弹层开着时保持参考挑选态，方便连续添加多个
    if (!mediaSheetOpen.value && !agentSheetOpen.value) {
      pendingFillNodeId.value = '';
      pendingRefPick.value = false;
    } else {
      pendingFillNodeId.value = fillId;
      pendingRefPick.value = true;
    }
    selectedId.value = fillId;
    return;
  }
  pendingFillNodeId.value = '';
  pendingRefPick.value = false;

  const isVid =
    /\.(mp4|webm|mov)(\?|$)/i.test(asset.url) || /video/i.test(String(asset.type || ''));
  const type = isVid ? 'input.video' : 'input.image';
  const def = catalogMap(catalog.value).get(type);
  if (!def) return;
  const id = newNodeId('n');
  const pos = flowPos || {
    x: dropPos.value.x + 40,
    y: dropPos.value.y + (isVid ? 80 : 0),
  };
  nodes.value = [
    ...nodes.value,
    {
      id,
      type: 'workflow',
      position: pos,
      data: {
        label: asset.name || '',
        nodeType: type,
        params: {
          ...(def.defaultParams || {}),
          url: asset.url,
          assetId: asset.id,
          name: asset.name || '',
          ...(isVid && assetPosterUrl(asset) ? { posterUrl: assetPosterUrl(asset) } : {}),
        },
        catalog: def,
        previewImage: isVid ? assetPosterUrl(asset) : asset.url,
        previewVideo: isVid ? asset.url : '',
      } satisfies WorkflowFlowNodeData,
    },
  ];
  selectedId.value = id;
  markDirty();
  ElMessage.success(isVid ? '已拖入视频节点' : '已拖入图片节点');
}

function applyAssetToNode(
  nodeId: string,
  asset: HistoryAsset,
  opts?: { insertCite?: boolean },
) {
  const n = nodes.value.find((x: any) => x.id === nodeId);
  if (!n || !asset.url) return false;
  const data = (n.data || {}) as WorkflowFlowNodeData;
  const t = data.nodeType;

  if (t === 'ai.image' || t === 'ai.video') {
    return attachMediaRefToAiNode(nodeId, asset);
  }
  if (t === 'ai.chat') {
    pendingRefPick.value = false;
    const isVid =
      isLikelyVideoUrl(asset.url) || /video/i.test(String(asset.type || ''));
    const mediaType = isVid ? 'input.video' : 'input.image';
    const mediaDef = catalogMap(catalog.value).get(mediaType);
    const mediaId = newNodeId('n');
    const agentNode = n;
    const ax = Number(agentNode.position?.x || 0);
    const ay = Number(agentNode.position?.y || 0);
    const citeLabel = String(asset.name || (isVid ? '视频' : '素材')).trim() || (isVid ? '视频' : '素材');
    nodes.value = [
      ...nodes.value,
      {
        id: mediaId,
        type: 'workflow',
        position: { x: ax - 300, y: ay + agentManualRefs.value.length * 40 },
        data: {
          label: citeLabel,
          nodeType: mediaType,
          params: {
            ...(mediaDef?.defaultParams || {}),
            url: asset.url,
            assetId: asset.id,
            ...(isVid && assetPosterUrl(asset) ? { posterUrl: assetPosterUrl(asset) } : {}),
          },
          catalog: mediaDef,
          previewImage: isVid ? assetPosterUrl(asset) : asset.url,
          previewVideo: isVid ? asset.url : '',
        } satisfies WorkflowFlowNodeData,
      },
    ];
    void (async () => {
      await nextTick();
      try {
        updateNodeInternals([mediaId, nodeId]);
      } catch {
        /* ignore */
      }
      await nextTick();
      await new Promise((r) => setTimeout(r, 40));
      ensureMediaAgentEdge(mediaId, nodeId);
      try {
        updateNodeInternals([mediaId, nodeId]);
      } catch {
        /* ignore */
      }
    })();
    setParamById(nodeId, 'referenceImage', asset.url);
    if (opts?.insertCite !== false) {
      if (!agentSheetOpen.value || selectedId.value !== nodeId) openAgentSheetFor(nodeId);
      void nextTick(() => {
        agentSheetCompRef.value?.insertCite?.({
          label: citeLabel,
          id: asset.id || mediaId,
          url: asset.url,
          mediaKind: isVid ? 'video' : 'image',
        });
      });
    }
    ElMessage.success(isVid ? '已引用视频并连线到 Agent' : '已引用素材并连线到 Agent');
    return true;
  }

  if (t === 'input.text') {
    pendingRefPick.value = false;
    const imgDef = catalogMap(catalog.value).get('input.image');
    const imgId = newNodeId('n');
    const ax = Number(n.position?.x || 0);
    const ay = Number(n.position?.y || 0);
    const mediaCount = collectInboundMediaRefs(nodeId, { max: 9 }).length;
    nodes.value = [
      ...nodes.value,
      {
        id: imgId,
        type: 'workflow',
        position: { x: ax - 300, y: ay + mediaCount * 40 },
        data: {
          label: asset.name || '参考图',
          nodeType: 'input.image',
          params: {
            ...(imgDef?.defaultParams || {}),
            url: asset.url,
            assetId: asset.id,
          },
          catalog: imgDef,
          previewImage: asset.url,
        } satisfies WorkflowFlowNodeData,
      },
    ];
    void (async () => {
      await nextTick();
      try {
        updateNodeInternals([imgId, nodeId]);
      } catch {
        /* ignore */
      }
      await nextTick();
      await new Promise((r) => setTimeout(r, 40));
      ensureMediaTextEdge(imgId, nodeId);
      syncTextReferenceFromEdges(nodeId);
      try {
        updateNodeInternals([imgId, nodeId]);
      } catch {
        /* ignore */
      }
    })();
    setParamById(nodeId, 'referenceImage', asset.url);
    ElMessage.success('已添加参考图并连线到文本');
    return true;
  }

  if (t !== 'input.image' && t !== 'input.video') return false;
  const isVid =
    /\.(mp4|webm|mov)(\?|$)/i.test(asset.url) || /video/i.test(String(asset.type || ''));
  if (t === 'input.image' && isVid) return false;
  if (t === 'input.video' && !isVid) return false;
  const poster = isVid ? assetPosterUrl(asset) : '';
  n.data = {
    ...data,
    label: asset.name || data.label || '',
    params: {
      ...(data.params || {}),
      url: asset.url,
      assetId: asset.id,
      name: asset.name || '',
      ...(poster ? { posterUrl: poster } : {}),
    },
    previewImage: isVid ? poster : asset.url,
    previewVideo: isVid ? asset.url : '',
  };
  markDirty();
  ElMessage.success('已填入当前节点');
  return true;
}

function onPickHistoryAsset(asset: HistoryAsset) {
  historyOpen.value = false;
  // 历史面板仍可点选：落到画布（保持拖拽主路径外的快捷入口）
  placeAssetOnCanvas(asset);
}

function onPaneContextMenu(event: MouseEvent) {
  openAddMenu(event);
}

function onNodeContextMenu(ev: NodeMouseEvent) {
  ev.event.preventDefault?.();
  const isGroup = isWorkflowGroupNode(ev.node);
  ensureNodeSelected(ev.node.id);
  const { x, y } = clientXY(ev.event as any);
  addPalette.open = false;
  menu.open = true;
  menu.x = x;
  menu.y = y;
  menu.nodeId = ev.node.id;
  menu.mode = isGroup ? 'group' : 'node';
}

function onEdgeContextMenu(ev: EdgeMouseEvent) {
  ev.event.preventDefault?.();
  edges.value = edges.value.filter((e) => e.id !== ev.edge.id);
  markDirty();
  ElMessage.success('已删除连线');
  closeMenu();
}

function closeMenu() {
  menu.open = false;
  menu.nodeId = '';
  menu.mode = 'node';
}

function onMenuDetail(nodeId?: string) {
  const id = String(nodeId || menu.nodeId || selectedId.value || '').trim();
  if (!id) {
    ElMessage.warning('未找到图片节点');
    return;
  }
  openImageDetailFor(id);
}

function addNode(type: string, position?: { x: number; y: number }) {
  if (type.startsWith('text.') && type !== 'text.template') {
    ElMessage.info('提示词请直接写在生图/视频节点弹框里');
    return;
  }
  // 画布「添加图片/视频」走 AI 生成节点；上传素材仍用 input.*
  if (type === 'input.image') type = 'ai.image';
  if (type === 'input.video') type = 'ai.video';
  const fallbacks: Record<string, { title: string; defaultParams: Record<string, unknown> }> = {
    'input.text': { title: '文本', defaultParams: { value: '', inputKey: '', referenceImage: '' } },
    'input.note': { title: '备注', defaultParams: { value: '' } },
    'ai.image': {
      title: '图片',
      defaultParams: {
        model: '',
        name: '',
        prompt: '',
        referenceImage: '',
        aspect: DEFAULT_MEDIA_ASPECT,
        size: '1K',
        imageGrid: '1',
        assetType: '',
      },
    },
    'ai.video': {
      title: '视频',
      defaultParams: {
        model: '',
        name: '',
        prompt: '',
        referenceImage: '',
        durationSec: 5,
        aspect: DEFAULT_MEDIA_ASPECT,
        resolution: '480p',
        refMode: 'text',
      },
    },
    'input.image': { title: '图片', defaultParams: { url: '', assetId: '', inputKey: '' } },
    'input.video': { title: '视频', defaultParams: { url: '', assetId: '', inputKey: '' } },
  };
  const def = catalogMap(catalog.value).get(type) || (fallbacks[type] ? { type, ...fallbacks[type] } : null);
  if (!def) {
    ElMessage.warning('未找到该节点类型');
    return;
  }
  const id = newNodeId('n');
  const pos = position || dropPos.value;
  const params = { ...(def.defaultParams || {}) } as Record<string, unknown>;
  if (type === 'ai.image') {
    if (!params.aspect) params.aspect = DEFAULT_MEDIA_ASPECT;
    if (!params.size) params.size = '1K';
  }
  if (type === 'ai.video') {
    // 新建默认文生视频（无连线）；连入图片后自动切全能参考
    params.refMode = 'text';
    if (!params.resolution) params.resolution = '480p';
    if (!params.aspect) params.aspect = DEFAULT_MEDIA_ASPECT;
    if (!params.durationSec) params.durationSec = 5;
  }
  const isMedia =
    type === 'ai.image' ||
    type === 'ai.video' ||
    type === 'input.image' ||
    type === 'input.video';
  const autoLabel = (() => {
    if (type === 'input.text') {
      const n = nodes.value.filter((x: any) => x.data?.nodeType === 'input.text').length + 1;
      return `文本${n}`;
    }
    if (type === 'input.image' || type === 'ai.image') {
      const n =
        nodes.value.filter((x: any) => ['input.image', 'ai.image'].includes(String(x.data?.nodeType))).length + 1;
      return `图片${n}`;
    }
    if (type === 'input.video' || type === 'ai.video') {
      const n =
        nodes.value.filter((x: any) => ['input.video', 'ai.video'].includes(String(x.data?.nodeType))).length + 1;
      return `视频${n}`;
    }
    if (type === 'ai.chat') {
      return 'Agent';
    }
    return isMedia ? '' : def.title;
  })();
  if (type === 'ai.chat') {
    if (!params.agentMode) params.agentMode = 'agent';
    if (!params.prompt) params.prompt = '';
  }
  nodes.value = [
    ...nodes.value,
    {
      id,
      type: 'workflow',
      position: { x: pos.x, y: pos.y },
      data: {
        label: autoLabel,
        nodeType: type,
        params,
        catalog: def as WorkflowNodeCatalogItem | null,
      } satisfies WorkflowFlowNodeData,
    },
  ];

  selectedId.value = id;
  if (type === 'ai.image' || type === 'ai.video') mediaSheetOpen.value = true;
  if (type === 'ai.chat') {
    agentManualRefs.value = [];
    openAgentSheetFor(id);
  }
  markDirty();
}

function snapshotNodeData(data: WorkflowFlowNodeData, empty = false) {
  const params = { ...(data.params || {}) };
  if (empty) {
    delete params.url;
    delete params.assetId;
    delete params.value;
    delete params.prompt;
    delete params.refs;
    delete params.lastImage;
    delete params.lastVideo;
    delete params.referenceImage;
    delete params.endImage;
  } else {
    // 复制时把预览图写进 params，粘贴后作为上游依赖可直接复用，避免又去生图
    const img = String(data.previewImage || params.lastImage || params.url || '').trim();
    const vid = String(data.previewVideo || params.lastVideo || '').trim();
    if (img && !params.lastImage) params.lastImage = img;
    if (vid && !params.lastVideo) params.lastVideo = vid;
  }
  return {
    ...data,
    params,
    previewImage: empty ? undefined : data.previewImage,
    previewVideo: empty ? undefined : data.previewVideo,
    previewText: empty ? undefined : data.previewText,
    status: empty ? undefined : data.status,
    statusMessage: empty ? undefined : data.statusMessage,
    outputs: empty ? undefined : data.outputs,
  } as WorkflowFlowNodeData;
}

function onMenuDuplicate() {
  const src = nodes.value.find((n) => n.id === menu.nodeId);
  if (!src) return;
  if (isWorkflowGroupNode(src)) {
    copyGroupToClipboard(src.id);
    closeMenu();
    return;
  }
  const data = (src.data || {}) as WorkflowFlowNodeData;
  const snap = snapshotNodeData(data, false);
  nodeClipboard.value = {
    kind: 'node',
    empty: false,
    nodeType: String(snap.nodeType || data.nodeType || ''),
    label: snap.label,
    params: { ...(snap.params || {}) },
    catalog: snap.catalog,
    previewImage: snap.previewImage,
    previewVideo: snap.previewVideo,
    previewText: snap.previewText,
  };
  ElMessage.success('已复制，右键空白处粘贴');
  closeMenu();
}

function onMenuCloneEmpty() {
  const src = nodes.value.find((n) => n.id === menu.nodeId);
  if (!src || isWorkflowGroupNode(src)) return;
  const data = (src.data || {}) as WorkflowFlowNodeData;
  const snap = snapshotNodeData(data, true);
  nodeClipboard.value = {
    kind: 'node',
    empty: true,
    nodeType: String(snap.nodeType || data.nodeType || ''),
    label: snap.label,
    params: { ...(snap.params || {}) },
    catalog: snap.catalog,
  };
  ElMessage.success('已克隆空节点到剪贴板，右键空白处粘贴');
  closeMenu();
}

/** 删除分组及其内部全部节点（含相关连线） */
function deleteGroupWithMembers(groupId: string) {
  const g = nodes.value.find((n: any) => n.id === groupId);
  if (!g || !isWorkflowGroupNode(g)) return;
  const memberIds = membersOfGroup(g).map((n: any) => String(n.id));
  const ids = new Set<string>([groupId, ...memberIds]);
  nodes.value = nodes.value.filter((n: any) => !ids.has(n.id));
  edges.value = edges.value.filter((e: any) => !ids.has(e.source) && !ids.has(e.target));
  if (selectedId.value && ids.has(selectedId.value)) selectedId.value = '';
  membersTick.value += 1;
  markDirty();
}

/** 复制分组到剪贴板（不立刻落画布） */
function copyGroupToClipboard(groupId: string) {
  const g = nodes.value.find((n: any) => n.id === groupId);
  if (!g || !isWorkflowGroupNode(g)) return;
  const members = membersOfGroup(g);
  const gData = (g.data || {}) as {
    title?: string;
    color?: string;
    imagePort?: boolean;
    sourceImageId?: string;
  };
  const style = (g.style || {}) as Record<string, unknown>;
  const width = Number.parseFloat(String(style.width ?? (g as any).dimensions?.width ?? 240));
  const height = Number.parseFloat(String(style.height ?? (g as any).dimensions?.height ?? 160));
  const memberIndex = new Map<string, number>();
  members.forEach((m: any, i: number) => memberIndex.set(m.id, i));
  const memberSet = new Set(members.map((m: any) => m.id));
  const clipEdges = (edges.value as any[])
    .filter((e) => memberSet.has(e.source) && memberSet.has(e.target))
    .map((e) => ({
      from: memberIndex.get(e.source)!,
      to: memberIndex.get(e.target)!,
      sourceHandle: String(e.sourceHandle || ''),
      targetHandle: String(e.targetHandle || ''),
    }))
    .filter((e) => Number.isFinite(e.from) && Number.isFinite(e.to));

  nodeClipboard.value = {
    kind: 'group',
    title: String(gData.title || '分组'),
    width: Number.isFinite(width) ? width : 240,
    height: Number.isFinite(height) ? height : 160,
    color: gData.color,
    imagePort: Boolean(gData.imagePort),
    sourceImageId: gData.sourceImageId,
    members: members.map((m: any) => ({
      dx: m.position.x - g.position.x,
      dy: m.position.y - g.position.y,
      data: snapshotNodeData((m.data || {}) as WorkflowFlowNodeData, false),
    })),
    edges: clipEdges,
  };
  ElMessage.success(`已复制分组（含 ${members.length} 个节点），右键空白处粘贴`);
}

function onPasteClipboardNode() {
  const clip = nodeClipboard.value;
  if (!clip) {
    ElMessage.info('剪贴板为空');
    return;
  }
  if (clip.kind === 'group') {
    pasteGroupFromClipboard(clip);
    return;
  }
  if (!clip.nodeType) {
    ElMessage.info('剪贴板为空');
    return;
  }
  const def = catalogMap(catalog.value).get(clip.nodeType);
  pushUndo();
  const id = newNodeId('n');
  const pasteParams = { ...(clip.params || def?.defaultParams || {}) };
  if (!clip.empty) {
    const img = String(clip.previewImage || pasteParams.lastImage || pasteParams.url || '').trim();
    const vid = String(clip.previewVideo || pasteParams.lastVideo || '').trim();
    if (img && !pasteParams.lastImage) pasteParams.lastImage = img;
    if (vid && !pasteParams.lastVideo) pasteParams.lastVideo = vid;
  }
  const base = snapshotNodeData(
    {
      label: clip.label || def?.title || '',
      nodeType: clip.nodeType,
      params: pasteParams,
      catalog: (clip.catalog || def) as any,
      previewImage: clip.previewImage,
      previewVideo: clip.previewVideo,
      previewText: clip.previewText,
    },
    clip.empty,
  );
  nodes.value = [
    ...nodes.value,
    {
      id,
      type: 'workflow',
      position: { x: dropPos.value.x, y: dropPos.value.y },
      data: base,
    },
  ];
  selectedId.value = id;
  markDirty();
  ElMessage.success(clip.empty ? '已粘贴空节点' : '已粘贴节点');
}

function pasteGroupFromClipboard(clip: Extract<NodeClipboardPayload, { kind: 'group' }>) {
  pushUndo();
  const originX = dropPos.value.x;
  const originY = dropPos.value.y;
  const newGroupId = newNodeId('g');
  const memberIds = clip.members.map(() => newNodeId('n'));
  const newGroup = {
    id: newGroupId,
    type: WF_GROUP_TYPE,
    position: { x: originX, y: originY },
    selected: true,
    connectable: true,
    data: {
      title: clip.title || '分组',
      color: clip.color || GROUP_COLORS[0],
      imagePort: true,
      sourceImageId: clip.sourceImageId,
      memberIds: [...memberIds],
    },
    style: {
      width: `${clip.width || 240}px`,
      height: `${clip.height || 160}px`,
    },
    zIndex: -10,
  };
  const newMembers = clip.members.map((m, i) => ({
    id: memberIds[i],
    type: 'workflow' as const,
    position: { x: originX + m.dx, y: originY + m.dy },
    selected: false,
    data: snapshotNodeData(m.data, false),
  }));
  const newEdges = clip.edges
    .map((e) => {
      const source = memberIds[e.from];
      const target = memberIds[e.to];
      if (!source || !target) return null;
      return {
        id: `e_${source}_${e.sourceHandle}_${target}_${e.targetHandle}`,
        source,
        target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        type: 'default' as const,
        animated: false,
        ...styleEdgeFromNodes(
          {
            source,
            sourceHandle: e.sourceHandle,
            target,
            targetHandle: e.targetHandle,
          } as any,
          [...nodes.value, newGroup as any, ...newMembers] as any,
        ),
      };
    })
    .filter(Boolean) as any[];

  nodes.value = [
    newGroup as any,
    ...nodes.value.map((n: any) => ({ ...n, selected: false })),
    ...newMembers,
  ];
  edges.value = [...(edges.value as any[]), ...newEdges] as any[];
  selectedId.value = newGroupId;
  membersTick.value += 1;
  markDirty();
  ElMessage.success(`已粘贴分组（含 ${newMembers.length} 个节点）`);
}

function onMenuDelete() {
  const id = menu.nodeId || selectedId.value;
  if (!id) return;
  const n = nodes.value.find((x: any) => x.id === id);
  if (!n) return;
  pushUndo();
  if (isWorkflowGroupNode(n)) {
    deleteGroupWithMembers(id);
    ElMessage.success('已删除分组及组内节点');
  } else {
    nodes.value = nodes.value.filter((x) => x.id !== id);
    edges.value = edges.value.filter((e) => e.source !== id && e.target !== id);
    if (selectedId.value === id) selectedId.value = '';
    markDirty();
  }
  closeMenu();
}

/** 右键菜单：只重跑选中的那个节点（Agent 走前端流式，其余走后端单节点运行） */
function onMenuRerun() {
  const id = menu.nodeId || selectedId.value;
  if (!id) return;
  const n = nodes.value.find((x: any) => x.id === id);
  if (!n || isWorkflowGroupNode(n)) {
    closeMenu();
    return;
  }
  const t = String(n.data?.nodeType || '');
  if (t === 'ai.chat') void runAgentLive(id);
  else void runNode(id);
  closeMenu();
}

function removeSelected() {
  const selected = nodes.value.filter((n: any) => n.selected);
  const seedIds = selected.length
    ? selected.map((n: any) => String(n.id))
    : selectedId.value
      ? [selectedId.value]
      : [];
  if (!seedIds.length) return;

  // 选中分组 → 级联带上组内成员
  const ids = new Set<string>(seedIds);
  for (const id of seedIds) {
    const n = nodes.value.find((x: any) => x.id === id);
    if (n && isWorkflowGroupNode(n)) {
      for (const m of membersOfGroup(n)) ids.add(String(m.id));
    }
  }

  pushUndo();
  const removedGroups = [...ids].some((id) => {
    const n = nodes.value.find((x: any) => x.id === id);
    return n && isWorkflowGroupNode(n);
  });
  nodes.value = nodes.value.filter((n: any) => !ids.has(n.id));
  edges.value = edges.value.filter((e) => !ids.has(e.source) && !ids.has(e.target));
  if (selectedId.value && ids.has(selectedId.value)) selectedId.value = '';
  if (removedGroups) membersTick.value += 1;
  markDirty();
}

function nextGroupTitle() {
  const used = new Set(
    nodes.value
      .filter((n: any) => isWorkflowGroupNode(n))
      .map((n: any) => String(n.data?.title || '')),
  );
  let i = 1;
  while (used.has(`分组${i}`)) i += 1;
  return `分组${i}`;
}

async function groupSelectedNodes() {
  const selected = nodes.value.filter((n: any) => n.selected && !isWorkflowGroupNode(n));
  const targets =
    selected.length > 0
      ? selected
      : selectedId.value
        ? nodes.value.filter((n: any) => n.id === selectedId.value && !isWorkflowGroupNode(n))
        : [];
  if (!targets.length) {
    ElMessage.info('请先框选或选中要分组的节点');
    return;
  }
  const title = nextGroupTitle();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of targets) {
    const r = getNodeRect(n);
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  // 略加大边距，避免边框/选中描边/缩放角标露边
  const padX = 56;
  const padTop = 52;
  const padBottom = 44;
  const color =
    GROUP_COLORS[nodes.value.filter((n: any) => isWorkflowGroupNode(n)).length % GROUP_COLORS.length];
  pushUndo();
  const id = newNodeId('g');
  const memberIds = targets.map((n: any) => String(n.id));
  nodes.value = [
    {
      id,
      type: WF_GROUP_TYPE,
      position: { x: minX - padX, y: minY - padTop },
      data: { title, color, imagePort: true, memberIds },
      style: {
        width: `${Math.max(160, maxX - minX + padX * 2)}px`,
        height: `${Math.max(100, maxY - minY + padTop + padBottom)}px`,
      },
      zIndex: -10,
      selectable: true,
      draggable: true,
      connectable: true,
      selected: true,
    },
    ...nodes.value.map((n: any) => ({ ...n, selected: false })),
  ];
  selectedId.value = '';
  membersTick.value += 1;
  syncGroupMemberPointerLock();
  // 再按实测尺寸撑开一次，兜住 DOM 未就绪时的低估
  nextTick(() => {
    if (expandGroupsToFitMembers()) markDirty();
  });
  markDirty();
  ElMessage.success('已创建分组（双击标题可重命名）');
}

function ungroupByIds(ids: string[]) {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) {
    ElMessage.info('请先选中要取消的分组');
    return;
  }
  pushUndo();
  const idSet = new Set(uniq);
  nodes.value = nodes.value.filter((n: any) => !idSet.has(n.id));
  membersTick.value += 1;
  syncGroupMemberPointerLock();
  markDirty();
  ElMessage.success('已取消分组');
}

function ungroupSelected() {
  const selectedGroups = nodes.value.filter((n: any) => n.selected && isWorkflowGroupNode(n));
  let ids = selectedGroups.map((n: any) => n.id);
  if (!ids.length) {
    // 若选中了节点，拆掉包含它们的分组
    const selectedNodes = nodes.value.filter((n: any) => n.selected && !isWorkflowGroupNode(n));
    if (selectedNodes.length) {
      const selSet = new Set(selectedNodes.map((n: any) => String(n.id)));
      ids = nodes.value
        .filter((g: any) => {
          if (!isWorkflowGroupNode(g)) return false;
          return membersOfGroup(g).some((n: any) => selSet.has(String(n.id)));
        })
        .map((g: any) => g.id);
    }
  }
  ungroupByIds(ids);
}

function setGroupColor(groupId: string, color: string) {
  const g = nodes.value.find((n: any) => n.id === groupId);
  if (!g || !isWorkflowGroupNode(g)) return;
  const next = String(color || '').trim();
  if (!next || String(g.data?.color || '') === next) return;
  pushUndo();
  g.data = { ...(g.data || {}), color: next };
  markDirty();
}

function arrangeGroupMembers(groupId: string, mode: 'grid' | 'row' | 'column' = 'grid') {
  const g = nodes.value.find((n: any) => n.id === groupId);
  if (!g || !isWorkflowGroupNode(g)) return;
  const members = membersOfGroup(g);
  if (!members.length) {
    ElMessage.info('分组内没有可整理的节点');
    return;
  }
  pushUndo();
  const gapX = 36;
  const gapY = 36;
  const padX = 56;
  const padTop = 52;
  const padBottom = 44;
  const sorted = [...members].sort((a: any, b: any) => {
    const ra = getNodeRect(a);
    const rb = getNodeRect(b);
    if (Math.abs(ra.y - rb.y) > 48) return ra.y - rb.y;
    return ra.x - rb.x;
  });
  const cols =
    mode === 'row'
      ? sorted.length
      : mode === 'column'
        ? 1
        : Math.min(sorted.length, Math.max(2, Math.ceil(Math.sqrt(sorted.length))));
  const originX = g.position?.x ?? 0;
  const originY = g.position?.y ?? 0;
  let x = originX + padX;
  let y = originY + padTop;
  let col = 0;
  let rowH = 0;
  let maxX = x;
  let maxY = y;
  const posMap = new Map<string, { x: number; y: number }>();
  for (const m of sorted) {
    const r = getNodeRect(m);
    posMap.set(m.id, { x, y });
    maxX = Math.max(maxX, x + r.w);
    maxY = Math.max(maxY, y + r.h);
    rowH = Math.max(rowH, r.h);
    col += 1;
    if (col >= cols) {
      col = 0;
      x = originX + padX;
      y += rowH + gapY;
      rowH = 0;
    } else {
      x += r.w + gapX;
    }
  }
  const nextW = Math.max(160, maxX - originX + padX);
  const nextH = Math.max(100, maxY - originY + padBottom);
  nodes.value = nodes.value.map((n: any) => {
    if (posMap.has(n.id)) {
      return { ...n, position: { ...posMap.get(n.id)! } };
    }
    if (n.id === groupId) {
      return {
        ...n,
        style: {
          ...(n.style || {}),
          width: `${nextW}px`,
          height: `${nextH}px`,
        },
      };
    }
    return n;
  });
  syncGroupMemberIds(
    groupId,
    sorted.map((n: any) => String(n.id)),
  );
  membersTick.value += 1;
  markDirty();
  const label = mode === 'row' ? '横向排列' : mode === 'column' ? '纵向排列' : '网格排列';
  ElMessage.success(`已${label}`);
}

async function batchDownloadGroup(groupId: string) {
  const g = nodes.value.find((n: any) => n.id === groupId);
  if (!g || !isWorkflowGroupNode(g)) return;
  const members = membersOfGroup(g);
  const items: { url?: string; text?: string; name: string; ext: string }[] = [];
  for (const m of members) {
    const data = (m.data || {}) as WorkflowFlowNodeData;
    const label = String(data.label || data.title || m.id || 'item').replace(
      /[\\/:*?"<>|]+/g,
      '_',
    );
    const nt = String(data.nodeType || '');
    if (nt === 'input.text' || nt === 'input.note' || nt === 'ai.chat') {
      let text = htmlToPlainText(
        String(data.params?.value || data.previewText || ''),
      );
      if (text) items.push({ text, name: label, ext: 'txt' });
      continue;
    }
    const url = mediaUrlFromNodeData(data);
    if (!url) continue;
    const isVid =
      /video/i.test(nt) ||
      /\.(mp4|webm|mov)(\?|$)/i.test(url) ||
      Boolean(data.previewVideo || data.params?.lastVideo);
    const ext = isVid
      ? /\.webm(\?|$)/i.test(url)
        ? 'webm'
        : /\.mov(\?|$)/i.test(url)
          ? 'mov'
          : 'mp4'
      : 'png';
    items.push({ url, name: label, ext });
  }
  if (!items.length) {
    ElMessage.info('组内暂无可下载内容');
    return;
  }
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i]!;
    try {
      if (it.text != null) {
        downloadTextFile(it.text, `${it.name}.${it.ext}`, 'text/plain;charset=utf-8');
      } else if (it.url) {
        await downloadUrl(it.url, `${it.name}.${it.ext}`);
      }
    } catch (e: any) {
      ElMessage.error(e?.message || `下载失败：${it.name}`);
    }
    if (i < items.length - 1) {
      await new Promise((r) => setTimeout(r, 160));
    }
  }
  ElMessage.success(`已开始下载 ${items.length} 个文件`);
}

function onKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName;
  const editing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable;
  if (e.code === 'Space' && !editing) {
    e.preventDefault();
    setSpacePan(true);
  }
  if (editing) return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && (selectedId.value || nodes.value.some((n: any) => n.selected))) {
    e.preventDefault();
    removeSelected();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g' && !e.shiftKey) {
    e.preventDefault();
    void groupSelectedNodes();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g' && e.shiftKey) {
    e.preventDefault();
    ungroupSelected();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
    e.preventDefault();
    undo();
  }
  if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
    e.preventDefault();
    redo();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openCanvasSearch();
  }
  if (e.key === 'Escape') {
    closeMenu();
    moreMenuOpen.value = false;
    if (searchOpen.value) searchOpen.value = false;
    else if (chatOpen.value) chatOpen.value = false;
  }
}

function onKeyup(e: KeyboardEvent) {
  if (e.code === 'Space') setSpacePan(false);
}

function onWindowBlur() {
  setSpacePan(false);
  if (dirty.value && !bootLoading.value && !scriptGenStore.isRunningFor(workflowId.value)) {
    void save({ force: true });
  }
}

function onFlowWrapMouseDown(e: MouseEvent) {
  const el = e.target as HTMLElement;
  if (el?.closest?.('input, textarea, select, button, a')) return;
  (e.currentTarget as HTMLElement)?.focus?.({ preventScroll: true });
}

async function uploadMedia() {
  // 画布右键「上传」：选本地图/视频，落到落点附近的新节点（不依赖当前选中）
  const files = await pickLocalFile({
    accept: 'image/*,video/*,.mp4,.webm,.mov,.m4v',
    multiple: true,
  });
  if (!files.length) return;

  pendingRefPick.value = false;
  pendingFillNodeId.value = '';
  uploading.value = true;
  try {
    const base = { ...dropPos.value };
    let placed = 0;
    for (const file of files.slice(0, 12)) {
      const isVid =
        /^video\//i.test(file.type) || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
      const asset = await uploadProjectAsset(projectId.value, file, {
        type: isVid ? 'video' : 'storyboard',
        name: file.name,
        workflowId: workflowId.value,
        workflowName: name.value,
      });
      if (!asset?.url) continue;
      const col = placed % 3;
      const row = Math.floor(placed / 3);
      placeAssetOnCanvas(asset, {
        x: base.x + col * 56,
        y: base.y + row * 56,
      });
      placed += 1;
    }
    if (placed) ElMessage.success(placed > 1 ? `已上传 ${placed} 个素材` : '已上传到画布');
    else ElMessage.warning('上传未返回可用地址');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '上传失败');
  } finally {
    uploading.value = false;
  }
}

function applyNodeStates(states: Record<string, any> | undefined, fromRunId?: string) {
  if (!states) return;
  let persistChanged = false;
  nodes.value = nodes.value.map((n) => {
    const st = states[n.id];
    if (!st) return n;
    // 用户已点终止的节点：忽略后续 SSE/轮询里的 running 盖写
    if (pendingCancelNodeIds.has(n.id) && isNodeBusyStatus(st.status)) return n;
    // 其它并发任务占用的节点：不覆盖其 busy/产物状态
    const owner = liveNodeRuns.value[n.id];
    if (owner && fromRunId && owner !== fromRunId) return n;
    const outs = st.outputs || {};
    const data = { ...(n.data as WorkflowFlowNodeData) };
    // 复用上次结果时保持 completed，避免首尾帧看起来像又在加载
    const msg = String(st.message || '');
    const reused = /复用|跳过/.test(msg);
    data.status = reused && st.status === 'completed' ? 'completed' : st.status;
    if (
      st.status === 'running' ||
      st.status === 'active' ||
      st.status === 'queued' ||
      st.status === 'pending'
    ) {
      data.statusMessage =
        msg ||
        (st.status === 'pending'
          ? '等待重跑…'
          : data.nodeType?.includes('video')
            ? '视频生成中…'
            : '生成中…');
    } else if (st.status === 'failed') {
      data.statusMessage = String(st.error || msg || '失败');
    } else if (reused) {
      data.statusMessage = '';
    } else {
      data.statusMessage = '';
    }
    const nextImage = outs.image ? String(outs.image) : '';
    const nextVideo = outs.video ? String(outs.video) : '';
    const nextPoster = String(outs.poster || '').trim();
    const mediaRev = String(
      outs.assetRef || st.finishedAt || st.startedAt || (st.status === 'completed' ? Date.now() : ''),
    );
    // 完成时强制写回预览（即使 URL 字符串相同也要刷新 mediaRev，避免缓存旧图）
    // 视频节点：优先用独立 poster JPG 作 previewImage，列表不加载 mp4
    if (nextPoster) data.previewImage = nextPoster;
    else if (nextImage) data.previewImage = nextImage;
    if (nextVideo) data.previewVideo = nextVideo;
    if (outs.text) data.previewText = String(outs.text);
    if (nextImage || nextVideo || (st.status === 'completed' && mediaRev)) {
      const params = { ...(data.params || {}) };
      const assetRef = String(outs.assetRef || '').trim();
      if (assetRef && params.assetId !== assetRef) {
        params.assetId = assetRef;
        persistChanged = true;
      }
      // 不再持久化 /api/uploads 本地镜像；展示一律 OSS
      if (params.localUrl) {
        delete params.localUrl;
        persistChanged = true;
      }
      if (nextImage && (params.lastImage !== nextImage || params.mediaRev !== mediaRev)) {
        params.lastImage = nextImage;
        if (mediaRev) params.mediaRev = mediaRev;
        if (st.status === 'completed') {
          params.generatedAt = String(st.finishedAt || new Date().toISOString());
        }
        persistChanged = true;
      }
      if (nextVideo && (params.lastVideo !== nextVideo || params.mediaRev !== mediaRev)) {
        params.lastVideo = nextVideo;
        if (mediaRev) params.mediaRev = mediaRev;
        persistChanged = true;
      }
      if (nextPoster && params.posterUrl !== nextPoster) {
        params.posterUrl = nextPoster;
        persistChanged = true;
      } else if (
        nextVideo &&
        nextImage &&
        !nextPoster &&
        !/\.(mp4|webm|mov)(\?|$)/i.test(nextImage) &&
        params.posterUrl !== nextImage
      ) {
        // ai.video 把封面放在 outputs.image 时一并落库
        params.posterUrl = nextImage;
        persistChanged = true;
      }
      // 记录接口实际提示词供「生成信息」；不覆盖输入框自定义文案
      const usedPrompt = String(outs.prompt || '').trim();
      if (st.status === 'completed' && usedPrompt && params.lastUsedPrompt !== usedPrompt) {
        params.lastUsedPrompt = usedPrompt;
        persistChanged = true;
      }
      if (st.status === 'completed' && mediaRev && params.mediaRev !== mediaRev) {
        params.mediaRev = mediaRev;
        persistChanged = true;
      }
      data.params = params;
    }
    if (outs.name) {
      const name = String(outs.name).trim();
      if (name) {
        data.label = name;
        data.params = { ...(data.params || {}), name };
      }
    }
    return { ...n, data };
  });
  // 把产物 URL 写进图，下次打开工作流才能回显
  if (persistChanged && !suppressDirty.value) markDirty();
  // 媒体卡出图后高度可能变化，稍后再撑开分组，避免竖图露在框外
  if (persistChanged) scheduleExpandGroups();
}

let expandGroupsTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleExpandGroups() {
  if (expandGroupsTimer) clearTimeout(expandGroupsTimer);
  expandGroupsTimer = setTimeout(() => {
    expandGroupsTimer = null;
    void nextTick(() => {
      try {
        updateNodeInternals(nodes.value.map((n: any) => n.id));
      } catch {
        /* ignore */
      }
      if (expandGroupsToFitMembers()) markDirty();
    });
  }, 120);
}

function pushUndo() {
  try {
    const snap = JSON.stringify(flowToGraph(nodes.value, edges.value, readFlowViewport()));
    undoStack.value.push(snap);
    if (undoStack.value.length > MAX_UNDO) undoStack.value.shift();
    redoStack.value = [];
  } catch {
    /* ignore */
  }
}

function applyGraphSnap(raw: string) {
  try {
    const g = JSON.parse(raw);
    const mapped = graphToFlow(g, catalog.value, activeRun.value?.nodeStates);
    nodes.value = mapped.nodes;
    edges.value = mapped.edges;
    const vp = normalizeSavedViewport(g?.viewport);
    if (vp) void setViewport(vp, { duration: 0 });
    markDirty();
  } catch {
    /* ignore */
  }
}

function undo() {
  const prev = undoStack.value.pop();
  if (!prev) return;
  try {
    redoStack.value.push(JSON.stringify(flowToGraph(nodes.value, edges.value, readFlowViewport())));
  } catch {
    /* ignore */
  }
  applyGraphSnap(prev);
}

function redo() {
  const next = redoStack.value.pop();
  if (!next) return;
  try {
    undoStack.value.push(JSON.stringify(flowToGraph(nodes.value, edges.value, readFlowViewport())));
  } catch {
    /* ignore */
  }
  applyGraphSnap(next);
}

function notifyRunError(raw?: string) {
  const msg = String(raw || '').trim() || '运行失败';
  ElNotification({
    title: '运行失败',
    message: msg,
    type: 'error',
    position: 'top-right',
    duration: 12000,
    showClose: true,
  });
}

function markNodesBusy(ids: string[], message = '生成中…') {
  const set = new Set(ids.filter(Boolean));
  if (!set.size) return;
  nodes.value = nodes.value.map((n) => {
    if (!set.has(n.id)) return n;
    const data = { ...(n.data as WorkflowFlowNodeData) };
    data.status = 'running';
    data.statusMessage = message;
    return { ...n, data };
  });
}

function clearNodesBusy(ids: string[]) {
  const set = new Set(ids.filter(Boolean));
  if (!set.size) return;
  nodes.value = nodes.value.map((n) => {
    if (!set.has(n.id)) return n;
    const st = (n.data as WorkflowFlowNodeData)?.status;
    if (!isNodeBusyStatus(st)) return n;
    const data = { ...(n.data as WorkflowFlowNodeData) };
    data.status = undefined;
    data.statusMessage = undefined;
    return { ...n, data };
  });
}

function runHasVisibleMedia(states: Record<string, any> | undefined) {
  if (!states) return false;
  for (const st of Object.values(states)) {
    const outs = (st as any)?.outputs || {};
    if (String(outs.image || '').trim() || String(outs.video || '').trim()) return true;
  }
  return false;
}

let lastCompletionToastAt = 0;
function toastRunCompleted(states?: Record<string, any>) {
  const now = Date.now();
  if (now - lastCompletionToastAt < 1200) return;
  lastCompletionToastAt = now;
  if (runHasVisibleMedia(states)) {
    ElMessage.success({ message: '生成完成', duration: 1800 });
    paletteRef.value?.refreshAssets?.();
  }
}

let saveInFlight: Promise<boolean> | null = null;
let saveAgain = false;
let lastSaveErrorAt = 0;

function currentPersistGraph() {
  return ensureMediaPipelineEdges(flowToGraph(nodes.value, edges.value, readFlowViewport()));
}

async function save(opts?: { force?: boolean }) {
  if (!workflowId.value || bootLoading.value) return false;
  // force 时仍避开 boot 的 suppress，但允许拖拽结束 / 运行前强刷
  if (!opts?.force && suppressDirty.value) return false;
  if (scriptGenStore.isRunningFor(workflowId.value)) return false;

  if (saveInFlight) {
    saveAgain = true;
    return saveInFlight;
  }

  saving.value = true;
  const run = async (): Promise<boolean> => {
    try {
      do {
        saveAgain = false;
        const graph = currentPersistGraph();
        const snap = JSON.stringify(graph);
        await updateWorkflow(workflowId.value, { name: name.value, graph });
        // 保存过程中若又改了位置/连线，保持 dirty 并立刻再写一轮
        const nowSnap = JSON.stringify(currentPersistGraph());
        if (nowSnap === snap) dirty.value = false;
        else {
          dirty.value = true;
          saveAgain = true;
        }
      } while (saveAgain);
      return true;
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || '保存画布失败';
      if (opts?.force || Date.now() - lastSaveErrorAt > 4000) {
        lastSaveErrorAt = Date.now();
        ElMessage.error(typeof msg === 'string' ? msg : '保存画布失败');
      }
      return false;
    } finally {
      saving.value = false;
      saveInFlight = null;
    }
  };
  saveInFlight = run();
  return saveInFlight;
}

function finishNodeRun(onlyNodeId: string, workflowRun: WorkflowRunRow) {
  applyNodeStates(workflowRun.nodeStates, workflowRun.id);
  const st = workflowRun.nodeStates?.[onlyNodeId];
  const runSt = String(workflowRun.status || '');
  const hasOut = Boolean(
    st?.outputs &&
      (String(st.outputs.image || '').trim() ||
        String(st.outputs.video || '').trim() ||
        String(st.outputs.text || '').trim()),
  );

  if (runSt === 'failed' || runSt === 'cancelled') {
    clearNodesBusy([onlyNodeId]);
    notifyRunError(workflowRun.error || workflowRun.message || '运行失败');
    return;
  }
  if (runSt === 'completed') {
    if (!st || !hasOut) {
      // 服务端空跑完成（常见：目标节点没写进图）→ 清掉假 loading
      clearNodesBusy([onlyNodeId]);
      notifyRunError(
        !st
          ? '运行未执行到该节点：画布可能未保存成功，请确认节点已连线后重试'
          : '运行完成但没有产出，请打开运行日志查看详情',
      );
      return;
    }
    // completed 会由 applyNodeStates 写入；若仍卡 busy 则清掉
    if (isNodeBusyStatus(st.status)) clearNodesBusy([onlyNodeId]);
    toastRunCompleted(workflowRun.nodeStates);
  }
}

async function runNode(onlyNodeId: string) {
  if (!onlyNodeId) return;
  // 同节点已在跑则忽略；其它节点可并行
  if (liveNodeRuns.value[onlyNodeId] || isNodeBusyStatus(
    (nodes.value.find((n: any) => n.id === onlyNodeId)?.data as WorkflowFlowNodeData | undefined)
      ?.status,
  )) {
    return;
  }
  // 先锁节点 loading，再保存/请求，避免空窗期可连点
  markNodesBusy([onlyNodeId], '正在生成…');
  try {
    // 强制把当前画布（含未连线的新节点）写回，再执行
    const saved = await save({ force: true });
    if (!saved && dirty.value) {
      throw new Error('保存画布失败，请检查网络后重试');
    }
    // 空 input.image 已在存盘时升为 ai.image：本地节点类型跟一次，避免 UI 仍当输入节点
    const upgraded = currentPersistGraph().nodes.find((n) => n.id === onlyNodeId);
    if (upgraded) {
      const localN = nodes.value.find((n: any) => n.id === onlyNodeId);
      if (localN && !isWorkflowGroupNode(localN) && localN.data?.nodeType !== upgraded.type) {
        localN.data = {
          ...(localN.data as WorkflowFlowNodeData),
          nodeType: upgraded.type,
          params: { ...(localN.data as WorkflowFlowNodeData).params, ...(upgraded.params || {}) },
          catalog: catalogMap(catalog.value).get(upgraded.type) || (localN.data as any).catalog,
        };
      }
    }
    const local = nodes.value.find((n: any) => n.id === onlyNodeId);
    if (!local || isWorkflowGroupNode(local)) {
      throw new Error('未找到要执行的节点');
    }
    const { workflowRun } = await runWorkflow(workflowId.value, {
      projectId: projectId.value,
      inputs: {},
      onlyNodeId,
      // 服务端会 mergeRecentCompletedStates；不传进行中的其它节点 run，避免串台
      priorRunId:
        activeRun.value && isTerminalRunStatus(activeRun.value.status)
          ? activeRun.value.id
          : undefined,
    });

    // 创建 run 期间用户已点终止：立刻取消，不要再标 busy / 开 poll
    if (pendingCancelNodeIds.has(onlyNodeId)) {
      pendingCancelNodeIds.delete(onlyNodeId);
      activeRun.value = workflowRun;
      try {
        if (workflowRun?.id && !isTerminalRunStatus(workflowRun.status)) {
          await cancelWorkflowRun(workflowRun.id);
        }
      } catch {
        /* ignore */
      }
      clearNodesBusy([onlyNodeId]);
      return;
    }

    activeRun.value = workflowRun;
    runModalId.value = workflowRun.id;
    trackLiveRun(workflowRun.id, onlyNodeId);
    const runSt = String(workflowRun.status || '');
    if (isTerminalRunStatus(runSt)) {
      untrackLiveRun(workflowRun.id);
      finishNodeRun(onlyNodeId, workflowRun);
      return;
    }
    const nodeSt = workflowRun.nodeStates?.[onlyNodeId]?.status;
    if (!isNodeBusyStatus(nodeSt)) markNodesBusy([onlyNodeId], '正在生成…');
    startPoll(workflowRun.id, onlyNodeId);
  } catch (e: any) {
    clearNodesBusy([onlyNodeId]);
    notifyRunError(e?.response?.data?.message || e?.message);
  }
}

function runSelectedNode() {
  if (!selectedId.value || mediaSheetRunning.value) return;
  const t = String(selectedData.value?.nodeType || '');
  if (t === 'ai.chat') {
    void runAgentLive(selectedId.value);
    return;
  }
  void runNode(selectedId.value);
}

/** Agent 节点：前端流式执行，弹层实时可见过程（不再静默轮询 workflow run） */
async function runAgentLive(nodeId: string) {
  if (!nodeId) return;
  const local = nodes.value.find((n: any) => n.id === nodeId);
  if (!local || isWorkflowGroupNode(local)) return;
  const data = (local.data || {}) as WorkflowFlowNodeData;
  if (data.nodeType !== 'ai.chat') {
    void runNode(nodeId);
    return;
  }
  if (agentLive.streaming || liveNodeRuns.value[nodeId] || isNodeBusyStatus(data.status)) {
    return;
  }

  const prompt = String(data.params?.prompt || '').trim();
  if (!prompt) {
    ElMessage.info('先写一句任务，或按 / 选用技能');
    openAgentSheetFor(nodeId);
    return;
  }

  if (String(data.params?.agentIntent || '').trim().toLowerCase() === 'ask') {
    ensureNodeSelected(nodeId);
    onAgentAsk();
    return;
  }

  const skillId = String(data.params?.skillId || '').trim();
  const skill = skillId ? findChatSkill(skillId) : null;
  const skillName = skill?.name || String(data.label || '').trim();
  // 用户气泡只用用户原文，不拼 /slash 前缀
  const displayUserMsg = prompt;

  agentAbort?.abort();
  agentAbort = new AbortController();
  agentSheetCompRef.value?.clearSurfaces?.();

  const refsPreview =
    selectedId.value === nodeId
      ? agentSheetRefs.value
      : collectInboundMediaRefs(nodeId, { max: 6 });

  resetAgentLive({
    nodeId,
    streaming: true,
    text: '',
    userMessage: displayUserMsg,
    phase: 'understanding',
    stepsOpen: true,
    sessionId: '',
    steps: buildAgentRunSteps({
      skillName: skillName || undefined,
      hasRefs: refsPreview.length > 0,
      hasCanvas: true,
    }),
  });
  markAgentStep('understand', 'active');
  persistAgentTranscript(nodeId, { a2uiMessages: null });

  ensureNodeSelected(nodeId);
  agentSheetOpen.value = true;
  mediaSheetOpen.value = false;
  textSheetOpen.value = false;
  {
    const n = nodes.value.find((x: any) => x.id === nodeId);
    if (n && !isWorkflowGroupNode(n)) {
      const cur = (n.data || {}) as WorkflowFlowNodeData;
      n.data = {
        ...cur,
        previewText: '',
        status: 'running',
        statusMessage: '理解中',
      };
    }
  }
  markNodesBusy([nodeId], '理解中…');
  setParamById(nodeId, 'prompt', '');
  setParamById(nodeId, 'promptDoc', '');
  setParamById(nodeId, 'citedImageUrls', '');
  setParamById(nodeId, 'citedVideoUrls', '');

  try {
    await new Promise((r) => setTimeout(r, 280));
    if (agentLive.nodeId !== nodeId || !agentLive.streaming) return;
    markAgentStep('understand', 'done');

    if (skillName) {
      markAgentStep('load-skill', 'active');
      await new Promise((r) => setTimeout(r, 220));
      if (agentLive.nodeId !== nodeId || !agentLive.streaming) return;
      markAgentStep('load-skill', 'done');
      markAgentStep('skill-ready', 'done', `技能已加载: ${skillName}`);
    } else {
      markAgentStep('load-ctx', 'active');
      await new Promise((r) => setTimeout(r, 180));
      if (agentLive.nodeId !== nodeId || !agentLive.streaming) return;
      markAgentStep('load-ctx', 'done');
    }
    if (refsPreview.length) markAgentStep('refs', 'done');

    agentLive.phase = 'generating';
    markAgentStep('generate', 'active');
    {
      const n = nodes.value.find((x: any) => x.id === nodeId);
      if (n && !isWorkflowGroupNode(n)) {
        const cur = (n.data || {}) as WorkflowFlowNodeData;
        n.data = { ...cur, status: 'running', statusMessage: '生成中' };
      }
    }
    markNodesBusy([nodeId], '生成中…');

    let system =
      String(data.params?.system || '').trim() ||
      '你是有用的创作助手，可基于参考图与画布上下文协助创作。';
    if (skill?.prompt) {
      const sk = String(skill.prompt).trim();
      if (sk && !system.includes(sk.slice(0, Math.min(40, sk.length)))) {
        system = `${sk}\n\n${system}`;
      } else if (sk && !String(data.params?.system || '').trim()) {
        system = sk;
      }
    }
    system = `${system}\n当前是 Agent 模式：理解用户任务后给出可执行建议；若用户要出图/视频，说明应落到画布对应节点，不要假装已生成媒体文件。`;

    const refs =
      selectedId.value === nodeId
        ? agentSheetRefs.value
        : collectInboundMediaRefs(nodeId, { max: 6 });
    if (refs.length) {
      system = `${system}\n用户提供了 ${refs.length} 个参考素材（已在工作流中连线），请结合其内容理解需求。`;
    }

    const canvasBlock = buildCanvasContextPrompt({
      workflowId: workflowId.value,
      workflowName: name.value,
      selectedIds: [nodeId],
      nodes: chatCanvasSnapshot.value.nodes,
      edges: chatCanvasSnapshot.value.edges,
    });

    const model = String(data.params?.model || '').trim() || undefined;
    const useA2ui = !!(skillId || String(data.params?.system || '').trim() || skill?.prompt);

    if (useA2ui) {
      await consumeAgentA2uiStream(nodeId, {
        action: 'start',
        message: prompt,
        system,
        skillId: skillId || undefined,
        skillLabel: skillName || undefined,
        canvasSummary: canvasBlock || undefined,
        model,
      });
    } else {
      if (canvasBlock) system = `${system}\n\n${canvasBlock}`;
      const text = await chatCompletionStream(
        [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        {
          model,
          signal: agentAbort!.signal,
          onEvent: (ev) => {
            if (agentLive.nodeId !== nodeId) return;
            if (ev.type === 'delta' && ev.text) {
              agentLive.text += ev.text;
              scheduleMirrorAgentPreview(nodeId);
            }
            if (ev.type === 'done' && typeof ev.text === 'string' && ev.text) {
              agentLive.text = ev.text;
              mirrorAgentPreview(nodeId, ev.text);
            }
          },
        },
      );
      const final = String(text || agentLive.text || '').trim();
      agentLive.text = final;
      markAgentStep('generate', 'done', '回复已生成');
      markAgentStep('finish', 'done');
      agentLive.phase = 'done';
      finishAgentNode(nodeId, final);
      if (final) ElMessage.success({ message: 'Agent 完成', duration: 1600 });
    }
  } catch (e: any) {
    handleAgentLiveError(nodeId, e);
  } finally {
    if (agentLive.nodeId === nodeId) agentLive.streaming = false;
    agentAbort = null;
  }
}

function finishAgentNode(nodeId: string, final: string) {
  const n = nodes.value.find((x: any) => x.id === nodeId);
  if (n && !isWorkflowGroupNode(n)) {
    const cur = (n.data || {}) as WorkflowFlowNodeData;
    n.data = {
      ...cur,
      previewText: final,
      status: 'completed',
      statusMessage: '',
    };
  }
  if (agentLive.nodeId === nodeId) {
    agentLive.text = final;
    agentLive.phase = 'done';
  }
  persistAgentTranscript(nodeId, { a2uiMessages: null, saveNow: true });
  markDirty();
  void save({ force: true });
}

type AgentCreateNodeSpec = {
  type: 'ai.video' | 'ai.image' | 'input.text';
  prompt: string;
  label?: string;
  durationSec?: number;
  aspect?: string;
};

function normalizeAgentCreateSpecs(
  payload: unknown,
  fallback: { reply: string; skillHint: string },
): AgentCreateNodeSpec[] {
  const out: AgentCreateNodeSpec[] = [];
  const p =
    payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : ({} as Record<string, unknown>);
  const rawList = Array.isArray(p.createNodes)
    ? p.createNodes
    : Array.isArray(p.nodes)
      ? p.nodes
      : p.node
        ? [p.node]
        : Array.isArray(p.outputs)
          ? p.outputs
          : [];
  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const t = String(row.type || row.nodeType || row.kind || '').toLowerCase();
    let type: AgentCreateNodeSpec['type'] | null = null;
    if (t.includes('video') || t === 'ai.video') type = 'ai.video';
    else if (t.includes('image') || t === 'ai.image' || t.includes('img')) type = 'ai.image';
    else if (t.includes('text') || t === 'input.text' || t === 'note') type = 'input.text';
    if (!type) continue;
    const prompt = String(row.prompt || row.text || row.value || fallback.reply || '').trim();
    if (!prompt) continue;
    const durationSec = Number(row.durationSec ?? row.duration ?? row.seconds);
    out.push({
      type,
      prompt,
      label: String(row.label || row.name || '').trim() || undefined,
      durationSec: Number.isFinite(durationSec) && durationSec > 0 ? durationSec : undefined,
      aspect: String(row.aspect || '').trim() || undefined,
    });
  }
  if (out.length) return out;

  const hint = `${fallback.skillHint}\n${fallback.reply}`.toLowerCase();
  if (/video|视频|\d+\s*秒|秒视频|文生视频|短视频|镜头/.test(hint)) {
    const durMatch = fallback.reply.match(/(\d+)\s*秒/) || fallback.skillHint.match(/(\d+)\s*s\b/i);
    const durationSec = durMatch ? Number(durMatch[1]) : 5;
    return [
      {
        type: 'ai.video',
        prompt: fallback.reply,
        durationSec: Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 5,
      },
    ];
  }
  if (/image|图片|出图|文生图|关键帧|海报|插画/.test(hint)) {
    return [{ type: 'ai.image', prompt: fallback.reply }];
  }
  if (
    fallback.reply &&
    (/文本|文案|剧本|台词|提示词|prompt|script|novel|小说|章节/.test(hint) ||
      fallback.reply.length >= 24)
  ) {
    return [{ type: 'input.text', prompt: fallback.reply }];
  }
  return [];
}

function createNodeBesideAgent(agentId: string, spec: AgentCreateNodeSpec, index: number): string | null {
  const agent = nodes.value.find((x: any) => x.id === agentId);
  if (!agent || isWorkflowGroupNode(agent)) return null;
  const type = spec.type;
  const def =
    catalogMap(catalog.value).get(type) ||
    (type === 'ai.video'
      ? {
          type,
          title: '视频',
          defaultParams: {
            model: '',
            prompt: '',
            durationSec: 5,
            aspect: DEFAULT_MEDIA_ASPECT,
            resolution: '480p',
            refMode: 'text',
          },
        }
      : type === 'input.text'
        ? {
            type,
            title: '文本',
            defaultParams: { value: '', inputKey: '', referenceImage: '' },
          }
        : {
            type,
            title: '图片',
            defaultParams: {
              model: '',
              prompt: '',
              aspect: DEFAULT_MEDIA_ASPECT,
              size: '1K',
              imageGrid: '1',
            },
          });
  const id = newNodeId('n');
  const params = { ...(def.defaultParams || {}) } as Record<string, unknown>;
  if (type === 'input.text') {
    params.value = spec.prompt;
  } else {
    params.prompt = spec.prompt;
  }
  if (type === 'ai.video') {
    params.refMode = 'text';
    if (spec.durationSec) params.durationSec = spec.durationSec;
    if (!params.resolution) params.resolution = '480p';
    if (!params.aspect) params.aspect = DEFAULT_MEDIA_ASPECT;
  } else if (type === 'ai.image') {
    if (!params.aspect) params.aspect = DEFAULT_MEDIA_ASPECT;
    if (!params.size) params.size = '1K';
  }
  if (spec.aspect && type !== 'input.text') params.aspect = spec.aspect;

  const count =
    nodes.value.filter((x: any) => {
      const nt = String(x.data?.nodeType);
      if (type === 'ai.video') return ['input.video', 'ai.video'].includes(nt);
      if (type === 'input.text') return nt === 'input.text';
      return ['input.image', 'ai.image'].includes(nt);
    }).length + 1;
  const label =
    spec.label ||
    (type === 'ai.video' ? `视频${count}` : type === 'input.text' ? `文本${count}` : `图片${count}`);
  const ax = Number(agent.position?.x) || 0;
  const ay = Number(agent.position?.y) || 0;

  nodes.value = [
    ...nodes.value,
    {
      id,
      type: 'workflow',
      position: { x: ax + 340, y: ay + index * 240 },
      data: {
        label,
        nodeType: type,
        params,
        catalog: def as WorkflowNodeCatalogItem,
        previewText: type === 'input.text' ? spec.prompt : undefined,
        status: undefined,
        statusMessage: undefined,
      } satisfies WorkflowFlowNodeData,
    },
  ];
  return id;
}

/** 落点完成后移除 Agent 自身及其连线 */
function removeAgentNodeAfterSpawn(agentId: string) {
  if (!agentId) return;
  if (agentLive.nodeId === agentId) {
    if (agentLive.streaming) {
      agentAbort?.abort();
      agentAbort = null;
    }
    resetAgentLive({ stepsOpen: true });
  }
  agentSheetCompRef.value?.clearSurfaces?.();
  agentSheetOpen.value = false;
  edges.value = (edges.value as any[]).filter(
    (e) => e.source !== agentId && e.target !== agentId,
  ) as any[];
  nodes.value = nodes.value.filter((n: any) => n.id !== agentId);
  if (selectedId.value === agentId) selectedId.value = '';
  if (imageActionNodeId.value === agentId) imageActionNodeId.value = '';
}

/** Agent 完成后：按 result/技能落图/视频/文本节点，并删除 Agent 自身 */
function applyAgentCompletionSideEffects(agentId: string, reply: string, payload: unknown): number {
  agentSheetCompRef.value?.clearSurfaces?.();
  const agent = nodes.value.find((x: any) => x.id === agentId);
  if (!agent || isWorkflowGroupNode(agent)) return 0;

  const data = (agent.data || {}) as WorkflowFlowNodeData;
  const skillHint = [
    String(data.params?.slash || ''),
    String(data.params?.skillId || ''),
    String(data.label || ''),
    String(data.params?.agentTitle || ''),
  ].join(' ');

  const specs = normalizeAgentCreateSpecs(payload, {
    reply: String(reply || '').trim(),
    skillHint,
  });
  if (!specs.length) return 0;

  const created: string[] = [];
  for (let i = 0; i < specs.length; i++) {
    const id = createNodeBesideAgent(agentId, specs[i], i);
    if (!id) continue;
    created.push(id);
  }
  if (!created.length) return 0;

  removeAgentNodeAfterSpawn(agentId);

  const first = created[0];
  const firstType = String(
    nodes.value.find((x: any) => x.id === first)?.data?.nodeType || '',
  );
  selectedId.value = first;
  agentSheetOpen.value = false;
  mediaSheetOpen.value = firstType === 'ai.image' || firstType === 'ai.video';
  textSheetOpen.value = firstType === 'input.text';
  const tip =
    firstType === 'ai.video'
      ? '已创建视频节点，Agent 已移除'
      : firstType === 'input.text'
        ? '已创建文本节点，Agent 已移除'
        : '已创建图片节点，Agent 已移除';
  ElMessage.success({ message: tip, duration: 1800 });
  markDirty();
  void save({ force: true });
  if (mediaSheetOpen.value) scheduleMediaSheetAnchor();
  else if (textSheetOpen.value) scheduleTextSheetAnchor();
  return created.length;
}

function handleAgentLiveError(nodeId: string, e: any) {
  const aborted =
    e?.name === 'AbortError' ||
    /cancel|abort|终止/i.test(String(e?.message || ''));
  if (aborted) {
    clearNodesBusy([nodeId]);
    agentLive.phase = 'idle';
    ElMessage.info('已终止 Agent');
  } else {
    agentLive.phase = 'failed';
    const n = nodes.value.find((x: any) => x.id === nodeId);
    if (n && !isWorkflowGroupNode(n)) {
      const cur = (n.data || {}) as WorkflowFlowNodeData;
      n.data = {
        ...cur,
        status: 'failed',
        statusMessage: String(e?.message || '失败'),
      };
    }
    notifyRunError(e?.response?.data?.message || e?.message || 'Agent 失败');
  }
}

async function consumeAgentA2uiStream(
  nodeId: string,
  body: {
    sessionId?: string;
    action?: string;
    message?: string;
    system?: string;
    skillId?: string;
    skillLabel?: string;
    canvasSummary?: string;
    model?: string;
    context?: Record<string, unknown>;
    dataModel?: Record<string, unknown>;
  },
) {
  let gotForm = false;
  let taskDone = false;
  await agentA2uiStream(body, {
    signal: agentAbort?.signal,
    onEvent: async (ev: AgentA2uiEvent) => {
      if (agentLive.nodeId !== nodeId) return;
      if (ev.type === 'session' && ev.sessionId) {
        agentLive.sessionId = String(ev.sessionId);
      }
      if (ev.type === 'status') {
        const msg = String((ev as any).message || '').trim();
        const stage = String((ev as any).stage || '');
        if (stage === 'understand') markAgentStep('understand', 'active');
        if (stage === 'generate' || stage === 'continue') {
          agentLive.phase = 'generating';
          markAgentStep('generate', 'active', msg || '正在生成…');
        }
        if (msg) {
          const n = nodes.value.find((x: any) => x.id === nodeId);
          if (n && !isWorkflowGroupNode(n)) {
            const cur = (n.data || {}) as WorkflowFlowNodeData;
            n.data = { ...cur, status: 'running', statusMessage: msg };
          }
        }
      }
      if (ev.type === 'delta' && (ev as any).text) {
        agentLive.text += String((ev as any).text);
        scheduleMirrorAgentPreview(nodeId);
      }
      if (ev.type === 'a2ui' && Array.isArray((ev as any).messages)) {
        gotForm = true;
        const messages = (ev as any).messages as Record<string, unknown>[];
        if ((ev as any).patch) {
          agentSheetCompRef.value?.patchA2ui?.(messages);
          persistAgentTranscript(nodeId, { saveNow: true });
        } else {
          agentSheetCompRef.value?.ingestA2ui?.(messages);
          markAgentStep('generate', 'done', '表单已生成');
          persistAgentTranscript(nodeId, { a2uiMessages: messages, saveNow: true });
        }
        if ((ev as any).patch) markAgentStep('generate', 'done', '表单已更新');
      }
      if (ev.type === 'done') {
        const result = (ev as any).result || {};
        const reply = String(result.reply || agentLive.text || '').trim();
        if (reply) {
          agentLive.text = reply;
          mirrorAgentPreview(nodeId, reply);
        }
        taskDone = result.done === true || (!gotForm && result.done !== false);
        if (taskDone) {
          markAgentStep('generate', 'done', '回复已生成');
          markAgentStep('finish', 'done');
          agentLive.phase = 'done';
          const created = applyAgentCompletionSideEffects(
            nodeId,
            reply,
            (result as any).payload ?? (result as any).result ?? null,
          );
          if (created) {
            clearNodesBusy([nodeId]);
          } else {
            finishAgentNode(nodeId, reply);
            if (reply) ElMessage.success({ message: 'Agent 完成', duration: 1600 });
          }
        } else {
          markAgentStep('generate', 'done', gotForm ? '请填写表单继续' : '等待继续');
          agentLive.phase = 'done';
          const n = nodes.value.find((x: any) => x.id === nodeId);
          if (n && !isWorkflowGroupNode(n)) {
            const cur = (n.data || {}) as WorkflowFlowNodeData;
            n.data = {
              ...cur,
              previewText: reply || cur.previewText,
              status: 'completed',
              statusMessage: gotForm ? '等待表单' : '',
            };
          }
          persistAgentTranscript(nodeId, { saveNow: true });
          markDirty();
        }
      }
      if (ev.type === 'error') {
        throw new Error(String((ev as any).message || 'Agent 失败'));
      }
    },
  });
  if (!taskDone && gotForm) {
    clearNodesBusy([nodeId]);
  }
}

async function onAgentA2uiAction(payload: AgentA2uiActionPayload) {
  const nodeId = agentLive.nodeId || selectedId.value;
  if (!nodeId || !agentLive.sessionId) {
    ElMessage.warning('会话已失效，请重新发送任务');
    return;
  }
  if (agentLive.streaming) return;

  const local = nodes.value.find((n: any) => n.id === nodeId);
  const data = (local?.data || {}) as WorkflowFlowNodeData;
  const skillId = String(data.params?.skillId || '').trim();
  const skill = skillId ? findChatSkill(skillId) : null;

  agentAbort?.abort();
  agentAbort = new AbortController();
  agentLive.streaming = true;
  agentLive.phase = 'generating';
  agentLive.text = '';
  markAgentStep('generate', 'active', '正在根据表单继续…');
  markNodesBusy([nodeId], '继续中…');

  try {
    await consumeAgentA2uiStream(nodeId, {
      sessionId: agentLive.sessionId,
      action: String(payload.context.actionId || payload.name || 'submit'),
      context: payload.context,
      dataModel: payload.dataModel,
      system: String(data.params?.system || skill?.prompt || ''),
      skillId: skillId || undefined,
      skillLabel: skill?.name || undefined,
      model: String(data.params?.model || '').trim() || undefined,
    });
  } catch (e: any) {
    handleAgentLiveError(nodeId, e);
  } finally {
    if (agentLive.nodeId === nodeId) agentLive.streaming = false;
    agentAbort = null;
  }
}

async function runFromSelected() {
  if (!selectedId.value) return;
  if (liveNodeRuns.value[selectedId.value]) return;
  markNodesBusy([selectedId.value], '正在生成…');
  try {
    await save({ force: true });
    const { workflowRun } = await runWorkflow(workflowId.value, {
      projectId: projectId.value,
      inputs: {},
      fromNodeId: selectedId.value,
      priorRunId:
        activeRun.value && isTerminalRunStatus(activeRun.value.status)
          ? activeRun.value.id
          : undefined,
    });
    activeRun.value = workflowRun;
    runModalId.value = workflowRun.id;
    claimBusyNodesFromStates(workflowRun.id, workflowRun.nodeStates);
    applyNodeStates(workflowRun.nodeStates, workflowRun.id);
    if (isTerminalRunStatus(workflowRun.status)) {
      finishNodeRun(selectedId.value, workflowRun);
      return;
    }
    startPoll(workflowRun.id, selectedId.value);
  } catch (e: any) {
    clearNodesBusy([selectedId.value]);
    notifyRunError(e?.response?.data?.message || e?.message);
  }
}

function onMenuSetMode(mode: 'active' | 'mute' | 'bypass') {
  if (!selectedId.value) return;
  pushUndo();
  nodes.value = nodes.value.map((n) => {
    if (n.id !== selectedId.value) return n;
    return {
      ...n,
      data: { ...(n.data as WorkflowFlowNodeData), mode },
      class: mode !== 'active' ? `wf-mode-${mode}` : undefined,
    };
  });
  markDirty();
}

function openRunModal(id?: string) {
  runModalId.value = id || activeRun.value?.id || runModalId.value || '';
  runModalOpen.value = true;
}

function onRunModalId(id: string) {
  runModalId.value = id;
}

function onRunModalRefreshed(r: WorkflowRunRow) {
  if (!r?.id) return;
  if (!activeRun.value || activeRun.value.id === r.id) {
    activeRun.value = r;
    applyNodeStates(r.nodeStates, r.id);
  }
  if (isTerminalRunStatus(r.status)) {
    untrackLiveRun(r.id);
    stopWatch(r.id);
  } else if (liveRunFocus.value[r.id] !== undefined || r.status === 'queued' || r.status === 'active') {
    claimBusyNodesFromStates(r.id, r.nodeStates);
    if (!isWatching(r.id)) {
      const focus = liveRunFocus.value[r.id] || String((r.inputs as any)?._runScope?.onlyNodeId || '');
      startPoll(r.id, focus || undefined);
    }
  }
}

function onRunModalRetried(r: WorkflowRunRow) {
  activeRun.value = r;
  runModalId.value = r.id;
  claimBusyNodesFromStates(r.id, r.nodeStates);
  applyNodeStates(r.nodeStates, r.id);
  const focus = String((r.inputs as any)?._runScope?.onlyNodeId || '');
  startPoll(r.id, focus || undefined);
}

function resolveRunIdForNode(nodeId: string): string {
  const id = String(nodeId || '').trim();
  if (!id) return '';
  const owned = String(liveNodeRuns.value[id] || '').trim();
  if (owned) return owned;
  const hit = Object.entries(liveRunFocus.value).find(([, focus]) => focus === id);
  return hit ? String(hit[0] || '').trim() : '';
}

/** 只终止某个节点对应的任务，其它并行节点继续跑 */
async function cancelNodeRun(nodeId: string) {
  const id = String(nodeId || '').trim();
  if (!id) return;

  // 先登记：即使此刻还没有 runId（保存/创建中），后续 runNode 返回后也会立刻取消
  pendingCancelNodeIds.add(id);

  let stoppedSomething = false;

  if (agentLive.streaming && agentLive.nodeId === id) {
    agentAbort?.abort();
    agentAbort = null;
    agentLive.streaming = false;
    agentLive.phase = 'idle';
    clearNodesBusy([id]);
    pendingCancelNodeIds.delete(id);
    stoppedSomething = true;
  }

  const runId = resolveRunIdForNode(id);
  if (!runId) {
    if (
      !stoppedSomething &&
      isNodeBusyStatus(
        (nodes.value.find((n: any) => n.id === id)?.data as WorkflowFlowNodeData | undefined)
          ?.status,
      )
    ) {
      clearNodesBusy([id]);
      stoppedSomething = true;
    }
    // 保留 pendingCancel：等 runId 落地后再真正 cancel API
    if (stoppedSomething) ElMessage.info('已终止生成');
    else ElMessage.info('该节点没有进行中的任务');
    return;
  }

  // 同一 workflow run 认领的节点一并清 busy（单次图运行会共享 runId）
  const ownedNodes = Object.entries(liveNodeRuns.value)
    .filter(([, rid]) => rid === runId)
    .map(([nid]) => nid);
  if (!ownedNodes.includes(id)) ownedNodes.push(id);
  for (const nid of ownedNodes) pendingCancelNodeIds.add(nid);

  stopWatch(runId);
  untrackLiveRun(runId);
  clearNodesBusy(ownedNodes);

  try {
    const r = await cancelWorkflowRun(runId);
    if (activeRun.value?.id === runId) {
      activeRun.value = r;
    }
    // 取消结果里的 nodeStates 可能仍短暂为 running：以本地清 busy 为准，不再盖回 loading
    clearNodesBusy(ownedNodes);
    for (const nid of ownedNodes) pendingCancelNodeIds.delete(nid);
    ElMessage.info('已终止生成');
  } catch (e: any) {
    // 失败时仍保持 UI 已停下；pending 保留以便重试
    clearNodesBusy(ownedNodes);
    ElMessage.error(e?.response?.data?.message || e?.message || '终止失败');
  }
}

function cancelSelectedNodeRun() {
  const id = String(selectedId.value || '').trim();
  if (!id) {
    void cancelActiveRun();
    return;
  }
  void cancelNodeRun(id);
}

/** 顶栏「终止全部」：停掉当前画布上所有进行中的任务 */
async function cancelActiveRun() {
  if (agentLive.streaming) {
    const id = agentLive.nodeId;
    agentAbort?.abort();
    agentAbort = null;
    agentLive.streaming = false;
    agentLive.phase = 'idle';
    if (id) clearNodesBusy([id]);
  }
  const runIds = Object.keys(liveRunFocus.value);
  const busyIds = (nodes.value as any[])
    .filter((n) => isNodeBusyStatus((n.data as WorkflowFlowNodeData | undefined)?.status))
    .map((n) => String(n.id));
  for (const nid of busyIds) pendingCancelNodeIds.add(nid);
  stopAllWatches();
  resetLiveRuns();
  textGenRunning.value = false;
  clearNodesBusy(busyIds);

  if (!runIds.length) {
    const fallback = activeRun.value?.id;
    if (!fallback) {
      for (const nid of busyIds) pendingCancelNodeIds.delete(nid);
      ElMessage.info('已终止');
      return;
    }
    try {
      const r = await cancelWorkflowRun(fallback);
      activeRun.value = r;
      clearNodesBusy(busyIds);
      for (const nid of busyIds) pendingCancelNodeIds.delete(nid);
      ElMessage.info('已终止生成');
    } catch (e: any) {
      clearNodesBusy(busyIds);
      ElMessage.error(e?.response?.data?.message || e?.message || '终止失败');
    }
    return;
  }

  const results = await Promise.allSettled(runIds.map((id) => cancelWorkflowRun(id)));
  const lastOk = [...results].reverse().find((x) => x.status === 'fulfilled') as
    | PromiseFulfilledResult<WorkflowRunRow>
    | undefined;
  if (lastOk) {
    activeRun.value = lastOk.value;
  }
  clearNodesBusy(busyIds);
  for (const nid of busyIds) pendingCancelNodeIds.delete(nid);
  const failed = results.filter((x) => x.status === 'rejected').length;
  if (failed && failed === results.length) {
    ElMessage.error('终止失败');
  } else {
    ElMessage.info(runIds.length > 1 ? `已终止 ${runIds.length} 个任务` : '已终止生成');
  }
}

async function retryActiveRun() {
  if (!activeRun.value?.id || retryingRun.value) return;
  retryingRun.value = true;
  try {
    const { workflowRun } = await retryWorkflowRun(activeRun.value.id);
    activeRun.value = workflowRun;
    runModalId.value = workflowRun.id;
    claimBusyNodesFromStates(workflowRun.id, workflowRun.nodeStates);
    applyNodeStates(workflowRun.nodeStates, workflowRun.id);
    const focus = String((workflowRun.inputs as any)?._runScope?.onlyNodeId || '');
    startPoll(workflowRun.id, focus || undefined);
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '重试失败');
  } finally {
    retryingRun.value = false;
  }
}

function addNodeFromPalette(type: string) {
  const center = screenToFlowCoordinate({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  });
  const n = createFreshNode(type, {
    position: {
      x: (center?.x || 200) + Math.random() * 40,
      y: (center?.y || 160) + Math.random() * 40,
    },
  });
  if (!n) {
    ElMessage.error('无法添加该节点');
    return;
  }
  selectedId.value = n.id;
  markDirty();
}

function onPaletteDrop(ev: DragEvent) {
  const assetRaw = ev.dataTransfer?.getData('application/x-studio-asset');
  if (assetRaw) {
    try {
      const asset = JSON.parse(assetRaw) as HistoryAsset;
      const flowPos = screenToFlowCoordinate({ x: ev.clientX, y: ev.clientY });
      dropPos.value = flowPos;

      const hit = document
        .elementsFromPoint(ev.clientX, ev.clientY)
        .map((el) => (el as HTMLElement).closest?.('.vue-flow__node') as HTMLElement | null)
        .find(Boolean);
      const hitId = hit?.getAttribute('data-id') || '';
      if (hitId && applyAssetToNode(hitId, asset)) {
        pendingFillNodeId.value = '';
        pendingRefPick.value = false;
        selectedId.value = hitId;
        return;
      }
      placeAssetOnCanvas(asset, { x: flowPos.x - 80, y: flowPos.y - 40 });
    } catch {
      /* ignore */
    }
    return;
  }
  const type = ev.dataTransfer?.getData('application/x-workflow-node');
  if (!type) return;
  const pos = screenToFlowCoordinate({ x: ev.clientX, y: ev.clientY });
  const n = createFreshNode(type, {
    position: { x: pos.x - 80, y: pos.y - 40 },
  });
  if (n) {
    selectedId.value = n.id;
    markDirty();
  }
}

provide('studioRunNode', (id: string) => {
  selectedId.value = id;
  const n = nodes.value.find((x: any) => x.id === id);
  const t = String(n?.data?.nodeType || '');
  if (t === 'ai.chat') void runAgentLive(id);
  else void runNode(id);
});

provide('studioCancelRun', (id?: string) => {
  const nodeId = String(id || selectedId.value || '').trim();
  if (nodeId) void cancelNodeRun(nodeId);
  else void cancelActiveRun();
});

provide('studioUpdateNodeParam', (id: string, key: string, value: string) => {
  selectedId.value = id;
  setParamById(id, key, value);
});

provide('studioRenameNode', (id: string, label: string) => {
  setLabelById(id, label);
  const n = nodes.value.find((x: any) => x.id === id);
  if (n && !isWorkflowGroupNode(n) && String((n.data as any)?.nodeType || '') === 'ai.chat') {
    // Agent 无技能时用 agentTitle 展示用户命名；有技能时标题仍跟技能走
    setParamById(id, 'agentTitle', label);
  }
});

provide('studioTextNodeAction', (id: string, action: 'edit' | 'replace' | 'compose') => {
  textActionNodeId.value = id;
  ensureNodeSelected(id);
  if (textClickTimer) {
    clearTimeout(textClickTimer);
    textClickTimer = null;
  }
  // compose=单击对话条；edit=双击/工具栏编辑弹窗
  if (action === 'compose') {
    textSheetOpen.value = true;
    return;
  }
  if (action === 'edit') {
    textSheetOpen.value = false;
    textEditOpen.value = true;
    // 双击来自节点内部 stop 冒泡时，Vue Flow 可能丢掉 selected，下一帧再钉一次
    nextTick(() => ensureNodeSelected(id));
    return;
  }
  if (action === 'replace') textReplaceOpen.value = true;
});

provide(
  'studioMediaNodeAction',
  (id: string, action: 'upload' | 'asset' | 'ref-upload' | 'ref-asset') => {
    selectedId.value = id;
    pendingRefPick.value = action === 'ref-upload' || action === 'ref-asset';
    pendingFillNodeId.value =
      action === 'asset' || action === 'ref-asset' || action === 'ref-upload' ? id : '';
    if (action === 'upload' || action === 'ref-upload') {
      void uploadMediaOrRef(action === 'ref-upload');
      return;
    }
    focusPaletteAssets(action === 'ref-asset' ? 'global' : 'canvas');
  },
);

provide('studioGridSplitSession', gridSplitSession);
provide('studioSelectedId', selectedId);

provide(
  'studioMediaCardAction',
  (id: string, action: string, payload?: Record<string, string | number>) => {
    ensureNodeSelected(id);
    imageActionNodeId.value = id;
    ignoreSheetCloseUntil = Date.now() + 400;

    if (action === 'select') {
      return;
    }
    if (action === 'compose') {
      // 延迟打开，方便双击进详情时取消（间隔略大于系统双击）
      if (mediaClickTimer) clearTimeout(mediaClickTimer);
      const n = nodes.value.find((x: any) => x.id === id);
      const t = String(n?.data?.nodeType || '');
      mediaClickTimer = setTimeout(() => {
        if (t === 'ai.chat') openAgentSheetFor(id);
        else openMediaSheetFor(id);
        mediaClickTimer = null;
      }, t === 'ai.chat' ? 120 : 320);
      return;
    }
    if (action === 'agent-restart') {
      ensureNodeSelected(id);
      resetAgentNodeToEmpty(id);
      openAgentSheetFor(id);
      return;
    }
    if (action === 'replace') {
      const n = nodes.value.find((x: any) => x.id === id);
      const t = String(n?.data?.nodeType || '');
      if (t === 'ai.video' || t === 'input.video') {
        pendingFillNodeId.value = id;
        ensureNodeSelected(id);
        void uploadMediaOrRef(false);
        return;
      }
      imageReplaceOpen.value = true;
      return;
    }
    if (action === 'detail') {
      if (mediaClickTimer) {
        clearTimeout(mediaClickTimer);
        mediaClickTimer = null;
      }
      if (textClickTimer) {
        clearTimeout(textClickTimer);
        textClickTimer = null;
      }
      mediaSheetOpen.value = false;
      textSheetOpen.value = false;
      ignorePaneClickUntil = Date.now() + 400;
      openImageDetailFor(id);
      return;
    }
    if (action === 'grid-split-preview') {
      const rows = Number(payload?.rows) || 3;
      const cols = Number(payload?.cols) || 3;
      gridSplitSession.value = { nodeId: id, rows, cols };
      return;
    }
    if (action === 'grid-split-cancel') {
      gridSplitSession.value = null;
      return;
    }
    if (action === 'grid-split-confirm') {
      const rows = Number(payload?.rows) || gridSplitSession.value?.rows || 3;
      const cols = Number(payload?.cols) || gridSplitSession.value?.cols || 3;
      void confirmGridSplitFromNode(id, rows, cols);
      return;
    }
    if (action === 'multigrid') {
      // 多宫格 = 派生一个生图节点：源图作参考 + 同模型 API 立刻生成
      const imageGrid = String(payload?.imageGrid || '9');
      const label = String(payload?.label || `${imageGrid}宫格`);
      const kind = String(payload?.kind || '');
      const aspect = String(payload?.aspect || (imageGrid === '1' ? '16:9' : '1:1'));
      const size = String(payload?.size || '1K');
      const prompt = String(payload?.prompt || '').trim();
      const mode = String(payload?.mode || '').trim();
      const src = nodes.value.find((n: any) => n.id === id);
      const srcPrompt = String((src?.data as any)?.params?.prompt || '').trim();
      const defaults: Record<string, string> = {
        three_view: '角色三视图：正面、侧面、背面，同一人物同一服装，干净背景，均匀打光，四宫格排布',
        multi_cam: '同一场景多机位分镜：正面、侧面、俯视、过肩，保持角色身份与服装一致',
        storyboard9: '九宫格分镜故事板：连续叙事镜头，景别与构图有变化，同一角色与场景风格统一',
        super_board: '十六宫格超级故事板：完整情节节拍，镜头语言丰富，角色与场景前后一致',
      };
      const params: Record<string, string> = {
        imageGrid,
        assetType: 'storyboard',
        aspect,
        size,
        op: 'multigrid',
        multigridKind: kind,
      };
      if (mode) params.multigridMode = mode;
      let finalPrompt = prompt || defaults[kind] || srcPrompt || '基于参考图生成多宫格分镜';
      if (kind === 'multi_cam' && mode) {
        const modeLabel =
          mode === 'creative' ? '创意' : mode === 'wild' ? '放飞' : '稳定';
        finalPrompt = [finalPrompt, `多机位·${modeLabel}构图`].filter(Boolean).join('\n');
      }
      params.prompt = finalPrompt;
      if (kind === 'three_view' || kind === 'storyboard9' || kind === 'super_board') {
        // 宫格合图用 1:1 更稳；三视图跟面板比例
        if (kind !== 'three_view') params.aspect = '1:1';
      }
      void deriveImageFromNode(id, {
        label,
        params,
        openSheet: false,
        autoRun: true,
        requireSourceImage: true,
        toast: `正在生成「${label}」…`,
      });
      return;
    }
    if (
      action === 'lineart' ||
      action === 'rebg' ||
      action === 'panorama' ||
      action === 'fullbody'
    ) {
      const src = nodes.value.find((n: any) => n.id === id);
      const srcPrompt = String((src?.data as any)?.params?.prompt || '').trim();
      const cardBg = String(
        payload?.cardBg || (src?.data as any)?.params?.cardBg || '#ffffff',
      ).trim();
      const bgLabel =
        ({
          '#ffffff': '纯白',
          '#f5f0e6': '米白',
          '#e5e5e5': '浅灰',
          '#111111': '纯黑',
          '#00c853': '绿幕',
          '#1e88e5': '蓝色',
          '#f48fb1': '粉色',
          '#262626': '深灰',
        } as Record<string, string>)[cardBg.toLowerCase()] || '干净纯色';
      // 线稿 / 换背景互不关联：线稿固定自身提示；背景仅 rebg 使用所选色
      const presets: Record<string, { label: string; intent: string; aspect?: string }> = {
        lineart: {
          label: '线稿',
          intent:
            '将参考图转为清晰黑白线稿/勾线稿，干净白底，保留主体轮廓与关键结构线，去除颜色填充与复杂光影，线条干净利落',
        },
        rebg: {
          label: `${bgLabel}背景`,
          intent: `基于参考图更换背景：保留主体外观、姿态与比例不变，将背景替换为均匀的${bgLabel}纯色（色值 ${cardBg}），边缘自然融合，无杂物、无渐变、无阴影脏边`,
        },
        panorama: {
          label: '全景',
          intent:
            '基于参考图横向扩展为更宽全景画面，保持风格、主体与光影连贯，自然延展两侧环境',
          aspect: '21:9',
        },
        fullbody: {
          label: '全身照',
          intent: [
            '【硬约束·单帧全身照】只输出一张画面：一名人物完整站立全身像（head-to-toe），正面或微侧，居中构图。',
            '从头顶到脚底必须完整入镜，双脚着地、头顶留白；禁止半身、胸像、头肩特写、跪姿裁脚。',
            '从参考图提取同一人物的五官、发型、年龄感、体型、服装与画风；若参考是设定板/多视图，只取其中主人物外观，补全未见的腿、鞋、下装，风格须一致。',
            '纯白背景(#FFFFFF)，无场景、无地面透视、无道具、无文字标注、无色卡。',
            '【严禁】角色设定图、三视图、多宫格、拼贴、分镜板、表情表、服装细节小图、多人物同框、任何面板/网格布局。',
          ].join(''),
          aspect: '3:4',
        },
      };
      const conf = presets[action] || { label: action, intent: '基于参考图生成' };
      // 全身照：勿拼接原节点 prompt（常见含「设定图/三视图」会把模型拉回面板）
      const prompt =
        action === 'fullbody'
          ? conf.intent
          : [conf.intent, srcPrompt].filter(Boolean).join('\n');
      void deriveImageFromNode(id, {
        label: conf.label,
        params: {
          op: action,
          prompt,
          aspect:
            conf.aspect ||
            String((src?.data as any)?.params?.aspect || '16:9'),
          assetType:
            action === 'fullbody'
              ? 'character'
              : String((src?.data as any)?.params?.assetType || 'character_ref'),
          ...(action === 'rebg' ? { cardBg } : {}),
          ...(action === 'fullbody' ? { cardBg: '#ffffff' } : {}),
        },
        openSheet: false,
        autoRun: true,
        requireSourceImage: true,
        toast: `正在生成「${conf.label}」…`,
      });
      return;
    }
  },
);

async function uploadMediaOrRef(asReference: boolean, preferKind?: 'image' | 'video') {
  const fillId = pendingFillNodeId.value || selectedId.value;
  const fillNode = nodes.value.find((x: any) => x.id === fillId);
  const t = String(fillNode?.data?.nodeType || selectedData.value?.nodeType || '');
  if (!t) return;
  const asRef = asReference || pendingRefPick.value;
  const kind = preferKind || pendingRefMediaKind.value || 'image';
  const wantVideo =
    kind === 'video' ||
    (!asRef && (t === 'ai.video' || t === 'input.video') && kind !== 'image');
  const files = await pickLocalFile({
    accept: asRef
      ? wantVideo
        ? 'video/*,.mp4,.webm,.mov'
        : 'image/*'
      : wantVideo
        ? 'video/*,.mp4,.webm,.mov'
        : 'image/*',
    multiple: asRef && !wantVideo,
  });
  if (!files.length) {
    pendingRefPick.value = false;
    pendingFillNodeId.value = '';
    return;
  }
  uploading.value = true;
  try {
    const targetId = fillId || selectedId.value;
    let added = 0;
    for (const file of files.slice(0, asRef ? (wantVideo ? 1 : 9) : 1)) {
      const isVidFile = wantVideo || /^video\//i.test(file.type) || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
      const asset = await uploadProjectAsset(projectId.value, file, {
        type: isVidFile ? 'video' : 'storyboard',
        name: file.name,
        workflowId: workflowId.value,
        workflowName: name.value,
      });
      if (asRef) {
        const targetNode = nodes.value.find((x: any) => x.id === targetId);
        const tt = String(targetNode?.data?.nodeType || '');
        if (tt === 'ai.chat') {
          if (applyAssetToNode(targetId, { ...asset, type: isVidFile ? 'video' : 'image' } as HistoryAsset, {
            insertCite: true,
          })) {
            added += 1;
          }
        } else if (attachMediaRefToAiNode(targetId, asset)) {
          added += 1;
        }
      } else {
        setParamById(targetId, 'url', asset.url || '');
        setParamById(targetId, 'assetId', asset.id);
        ElMessage.success(t.includes('video') ? '已替换视频' : '已上传，可连线到下游节点');
        added += 1;
        break;
      }
    }
    if (asRef) {
      // Agent 弹层保持可选态，方便连续添加
      pendingRefPick.value = mediaSheetOpen.value || agentSheetOpen.value;
      pendingFillNodeId.value =
        mediaSheetOpen.value || agentSheetOpen.value ? targetId : '';
      if (!added) {
        /* attach 内已提示 */
      }
    } else {
      pendingFillNodeId.value = '';
      pendingRefPick.value = false;
    }
  } catch (e: any) {
    pendingRefPick.value = false;
    pendingFillNodeId.value = '';
    ElMessage.error(e?.response?.data?.message || e?.message || '上传失败');
  } finally {
    uploading.value = false;
  }
}

async function boot() {
  bootLoading.value = true;
  suppressDirty.value = true;
  pendingBootViewport = null;
  bootViewportRestored = false;
  stopAllWatches();
  resetLiveRuns();
  activeRun.value = null;
  nodes.value = [];
  edges.value = [];
  try {
    await ensureAiSettings();
    catalog.value = await fetchNodeCatalog('studio');
    const w = await fetchWorkflow(workflowId.value);
    name.value = w.name;
    workflowProjectId.value = String(w.projectId || '').trim();
    const beforeEdgeCount = w.graph?.edges?.length || 0;
    const beforeNodeCount = w.graph?.nodes?.length || 0;
    const graph = ensureMediaPipelineEdges(w.graph || { schemaVersion: 1, nodes: [], edges: [] });
    // 历史双绑/单节点反复「拖了像没存」会导致坐标飞到万里之外；拉回可视区
    let agentPosNormalized = false;
    const only = (graph.nodes || []).length === 1 ? graph.nodes![0] : null;
    if (
      only?.type === 'ai.chat' &&
      only.position &&
      (Math.abs(Number(only.position.x)) > 4000 || Math.abs(Number(only.position.y)) > 4000)
    ) {
      only.position = { x: 220, y: 140 };
      pendingBootViewport = null;
      agentPosNormalized = true;
    } else {
      pendingBootViewport = normalizeSavedViewport((w.graph as any)?.viewport ?? (graph as any)?.viewport);
    }

    // 恢复最近运行产物；并收集仍在 queued/active 的任务以便接回订阅
    let restoredStates: Record<string, any> = {};
    let liveRuns: WorkflowRunRow[] = [];
    try {
      const runs = await fetchWorkflowRuns({ workflowId: workflowId.value });
      restoredStates = mergeCompletedRunStates(runs);
      liveRuns = runs.filter((r) => r.status === 'queued' || r.status === 'active');
      for (const r of [...liveRuns].reverse()) {
        for (const [id, st] of Object.entries(r.nodeStates || {})) {
          restoredStates[id] = st;
        }
      }
      const latest =
        liveRuns[0] ||
        runs.find((r) => r.status === 'completed' || r.status === 'failed') ||
        runs[0];
      if (latest) {
        activeRun.value = latest;
        runModalId.value = latest.id;
      }
    } catch {
      restoredStates = {};
      liveRuns = [];
    }

    const flow = graphToFlow(graph, catalog.value, restoredStates);
    // 先挂节点，等 Handle 注册后再挂边
    nodes.value = flow.nodes;
    edges.value = [];
    await nextTick();
    try {
      updateNodeInternals(flow.nodes.map((n) => n.id));
    } catch {
      /* ignore */
    }
    await nextTick();
    await hydrateEdges(flow.edges);

    // 旧切分组可能丢了源图连线，按 sourceImageId / 左侧最近图补回
    const splitEdgesFixed = ensureSplitGroupEdges();
    if (splitEdgesFixed) await hydrateEdges(edges.value as any[]);

    // 分组框按内部节点撑开（修模板右边包不全）
    await nextTick();
    const groupsExpanded = expandGroupsToFitMembers();

    // 把运行产物写进节点 params，并静默保存，保证下次打开不依赖运行记录
    // 脚本后台生成中勿回写，避免把旧图画回去盖住即将落库的新图
    const hydrated = persistPreviewParamsFromNodes();
    const scriptGenBusy = scriptGenStore.isRunningFor(workflowId.value);
    if (
      !scriptGenBusy &&
      (edges.value.length !== beforeEdgeCount ||
        nodes.value.filter((n) => !isWorkflowGroupNode(n)).length !== beforeNodeCount ||
        hydrated ||
        groupsExpanded ||
        splitEdgesFixed ||
        agentPosNormalized)
    ) {
      await updateWorkflow(workflowId.value, {
        name: name.value,
        graph: ensureMediaPipelineEdges(flowToGraph(nodes.value, edges.value, readFlowViewport())),
      });
    }
    dirty.value = false;
    selectedId.value = '';
    closeMenu();
    // 仅当内存结果比服务端更新时才覆盖，避免把已保存的连线/位置冲掉
    const wfUpdatedAt = Date.parse(String(w.updatedAt || '')) || 0;
    if (
      !scriptGenBusy &&
      scriptGenStore.lastWorkflowId === workflowId.value &&
      scriptGenStore.resultGraph &&
      scriptGenStore.lastCompletedAt > wfUpdatedAt
    ) {
      applyScriptGenResult(scriptGenStore.resultGraph);
    }

    // 刷新/重进后接回仍在服务端执行的任务（多路 SSE/轮询）
    for (const r of liveRuns) {
      const scope = (r.inputs as any)?._runScope || {};
      const only = String(scope.onlyNodeId || '').trim();
      claimBusyNodesFromStates(r.id, r.nodeStates);
      if (only) markNodesBusy([only], r.message || '正在生成…');
      startPoll(r.id, only || undefined);
    }

    const qRun = String(route.query.run || '').trim();
    if (qRun) {
      runModalId.value = qRun;
      runModalOpen.value = true;
      router.replace({ path: route.path, query: {} });
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '加载失败');
  } finally {
    try {
      await settleCanvasViewport();
    } catch {
      fitCanvasDefault();
    }
    bootLoading.value = false;
    suppressDirty.value = false;
    consumeShotScriptBoot();
  }
}

function consumeShotScriptBoot() {
  const wantOpen = String(route.query.openScript || '').trim();
  let payload: {
    shotId?: string;
    shotLabel?: string;
    shotBrief?: string;
    durationSec?: number;
    category?: string;
    tags?: string[];
    subStyle?: string;
  } | null = null;
  try {
    const raw = sessionStorage.getItem('lumina-shot-script-boot');
    if (raw) {
      payload = JSON.parse(raw);
      sessionStorage.removeItem('lumina-shot-script-boot');
    }
  } catch {
    payload = null;
  }
  if (!wantOpen && !payload) return;
  if (payload?.shotLabel || payload?.shotBrief || payload?.shotId) {
    const tags = Array.isArray(payload.tags)
      ? payload.tags.map((t) => String(t || '').trim()).filter(Boolean)
      : [];
    const subStyle =
      String(payload.subStyle || '').trim() ||
      tags.find((t) => t && t !== '画风' && t !== '动漫风') ||
      '';
    scriptCtx.shotId = String(payload.shotId || '');
    scriptCtx.shotLabel = String(payload.shotLabel || '');
    scriptCtx.shotBrief = String(payload.shotBrief || '');
    scriptCtx.category = String(payload.category || '');
    scriptCtx.subStyle = subStyle;
    scriptCtx.tags = tags;
    scriptCtx.durationSec = Number(payload.durationSec) === 15 ? 15 : 10;
    scriptCtx.mode = 'shot';
    scriptCtx.initialPrompt = String(payload.shotBrief || payload.shotLabel || '');
  }
  scriptGenOpen.value = true;
  if (wantOpen) {
    router.replace({ path: route.path, query: {} });
  }
  ElMessage.info(
    scriptCtx.shotId
      ? '请确认时长后生成细案：定妆 + 场景 + 三关键帧（开场/动作/收束）+ 一条成片'
      : '请在脚本生成器中生成分镜描述，确认后合并为一条成片管线',
  );
}

/** 合并多次运行里各节点最新完成输出 */
function mergeCompletedRunStates(runs: WorkflowRunRow[]) {
  const merged: Record<string, any> = {};
  for (const r of [...runs].reverse()) {
    for (const [id, st] of Object.entries(r.nodeStates || {})) {
      if (st?.status === 'completed' && st.outputs && Object.keys(st.outputs).length) {
        merged[id] = st;
      }
    }
  }
  // 保留最近一次运行的非完成状态（失败角标等），但不覆盖已有完成输出
  const latest = runs[0];
  if (latest?.nodeStates) {
    for (const [id, st] of Object.entries(latest.nodeStates)) {
      if (!merged[id]) merged[id] = st;
      else if (st.status === 'failed') {
        // 同节点最近失败时仍展示完成预览，状态用完成
      }
    }
  }
  return merged;
}

/** 若预览在 data 里但 params 还没有，写回 params 以便入库 */
function persistPreviewParamsFromNodes() {
  let anyChanged = false;
  nodes.value = nodes.value.map((n) => {
    if (isWorkflowGroupNode(n)) return n;
    const data = { ...(n.data as WorkflowFlowNodeData) };
    const params = { ...(data.params || {}) };
    const img = String(data.previewImage || '').trim();
    const vid = String(data.previewVideo || '').trim();
    let localChanged = false;
    if (img && params.lastImage !== img) {
      params.lastImage = img;
      localChanged = true;
    }
    if (vid && params.lastVideo !== vid) {
      params.lastVideo = vid;
      localChanged = true;
    }
    if (!localChanged) return n;
    anyChanged = true;
    data.params = params;
    return { ...n, data };
  });
  return anyChanged;
}

watch(
  () =>
    [
      selectedId.value,
      (nodes.value as any[]).filter((n) => n.selected).map((n) => n.id).join(','),
      (edges.value as any[]).length,
    ] as const,
  () => syncRelatedEdgeFlow(),
);

onMounted(() => {
  window.addEventListener('blur', onWindowBlur);
  window.addEventListener('resize', updateAgentSheetAnchor);
  void boot();
});
onUnmounted(() => {
  window.removeEventListener('blur', onWindowBlur);
  window.removeEventListener('resize', updateAgentSheetAnchor);
  setSpacePan(false);
  stopAllWatches();
  clearAutoSaveTimer();
  // 脚本后台生成中勿把旧画布回写，以免覆盖即将落库的新图
  if (dirty.value && !scriptGenStore.isRunningFor(workflowId.value)) void save();
});
watch(workflowId, boot);

const publishing = ref(false);

function closeRailPanels() {
  libraryOpen.value = false;
  historyOpen.value = false;
  paletteRef.value?.collapse?.();
  paletteOpen.value = false;
}

function toggleLibrary() {
  if (libraryOpen.value) {
    libraryOpen.value = false;
    return;
  }
  closeRailPanels();
  libraryTab.value = undefined;
  libraryApplyMode.value = 'auto';
  libraryOpen.value = true;
}

function toggleHistory() {
  if (historyOpen.value) {
    historyOpen.value = false;
    return;
  }
  closeRailPanels();
  historyOpen.value = true;
}

const searchNodes = computed(() =>
  nodes.value
    .filter((n: any) => n && !isWorkflowGroupNode(n))
    .map((n: any) => {
      const data = n.data || {};
      const label =
        String(data.label || data.catalog?.title || data.nodeType || n.id || '').trim() ||
        String(n.id);
      const prompt = String(data.params?.prompt || data.params?.text || '').trim();
      return {
        id: String(n.id),
        label,
        type: String(data.nodeType || n.type || ''),
        prompt,
      };
    }),
);

function openCanvasSearch() {
  chatOpen.value = false;
  moreMenuOpen.value = false;
  searchOpen.value = true;
}

function onSearchLocate(id: string) {
  focusDockNode(id);
}

function toggleChat() {
  searchOpen.value = false;
  moreMenuOpen.value = false;
  chatOpen.value = !chatOpen.value;
}

/**
 * 工作流对话动作桥（A2UI 风格：模型声明 action → 宿主执行画布权限）
 */
function onChatAction(action: ChatAction, sourceText?: string) {
  const name = String(action?.name || '');
  const args = (action?.args || {}) as Record<string, unknown>;

  if (name === 'run_skill') {
    // 已由对话面板/store 处理；此处忽略避免双跑
    return;
  }

  if (name === 'select_node') {
    const id = String(args.nodeId || '').trim();
    if (!id) {
      ElMessage.warning('未指定节点');
      return;
    }
    focusDockNode(id);
    return;
  }

  if (name === 'run_node') {
    const id = String(args.nodeId || selectedId.value || '').trim();
    if (!id) {
      ElMessage.warning('请先选中要运行的节点');
      return;
    }
    selectedId.value = id;
    void runNode(id);
    ElMessage.success('已开始运行节点');
    return;
  }

  if (name === 'add_node') {
    const type = String(args.type || 'ai.image').trim();
    const allow = new Set([
      'input.text',
      'input.note',
      'ai.chat',
      'ai.image',
      'ai.video',
      'input.image',
      'input.video',
    ]);
    if (!allow.has(type)) {
      ElMessage.warning(`暂不支持添加 ${type}`);
      return;
    }
    addNode(type);
    const prompt = String(args.prompt || '').trim();
    if (prompt && selectedId.value) {
      const t = String(
        (nodes.value.find((n: any) => n.id === selectedId.value)?.data as WorkflowFlowNodeData)
          ?.nodeType || '',
      );
      if (t === 'input.text' || t === 'input.note') setParamById(selectedId.value, 'value', prompt);
      else setParamById(selectedId.value, 'prompt', prompt);
    }
    ElMessage.success('已添加节点');
    return;
  }

  if (name === 'set_param') {
    const id = String(args.nodeId || selectedId.value || '').trim();
    const key = String(args.key || 'prompt').trim();
    const value = String(args.value ?? '').trim();
    if (!id || !key) {
      ElMessage.warning('改参数缺少 nodeId/key');
      return;
    }
    setParamById(id, key, value);
    focusDockNode(id);
    ElMessage.success('已更新节点参数');
    return;
  }

  if (name === 'to_canvas') {
    applyChatToCanvas(String(sourceText || ''), String(args.mode || 'image'));
    return;
  }

  ElMessage.info(`未处理的动作：${name}`);
}

/** 把对话里的 ```image / ```video 落到当前画布 */
function applyChatToCanvas(sourceText: string, mode: string) {
  const text = String(sourceText || '').trim();
  const wantVideo = mode === 'video';
  const images = extractCanvasImageItems(text);
  const videos = extractVideoPrompts(text);
  const extraPrompt = String(
    (text.match(/```(?:prompt)?\n([\s\S]*?)```/i) || [])[1] || '',
  ).trim();

  if (!images.length && !videos.length && !extraPrompt) {
    ElMessage.info('回复里没有可落地的 ```image / ```video，已保留在对话中');
    return;
  }

  const baseX = 120;
  const baseY = 100;
  let placed = 0;

  if (images.length) {
    images.slice(0, 12).forEach((item, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      addNode('ai.image', { x: baseX + col * 280, y: baseY + row * 220 });
      const id = selectedId.value;
      if (!id) return;
      setParamById(id, 'prompt', item.prompt);
      const n = nodes.value.find((x: any) => x.id === id);
      if (n?.data) {
        n.data = {
          ...(n.data as WorkflowFlowNodeData),
          label: item.title || `图${i + 1}`,
        };
      }
      placed += 1;
    });
  }

  if (wantVideo || videos.length) {
    const prompts = videos.length ? videos.slice(0, 4) : extraPrompt ? [extraPrompt] : [];
    if (!prompts.length && images.length) {
      // 有图无视频块：加一个视频节点挂在右侧
      addNode('ai.video', { x: baseX + 860, y: baseY });
      placed += 1;
    } else {
      prompts.forEach((p, i) => {
        addNode('ai.video', { x: baseX + 860, y: baseY + i * 240 });
        const id = selectedId.value;
        if (id) {
          setParamById(id, 'prompt', p);
          placed += 1;
        }
      });
    }
  }

  if (!placed && extraPrompt) {
    addNode(wantVideo ? 'ai.video' : 'ai.image', { x: baseX, y: baseY });
    if (selectedId.value) {
      setParamById(selectedId.value, 'prompt', extraPrompt);
      placed = 1;
    }
  }

  markDirty();
  nextTick(() => fitCanvasDefault());
  ElMessage.success(placed ? `已落到画布（${placed} 个节点）` : '已尝试落到画布');
}

function onEmptySkillPick(child: EmptySkillChild) {
  const action = child.action || 'pipeline';
  if (action === 'library') {
    toggleLibrary();
    return;
  }
  if (action === 'script') {
    openScriptGenerator();
    return;
  }
  if (action === 'skills') {
    router.push(child.skillsPath || '/skills');
    return;
  }
  // 不再自动种默认流水线：其余空态入口统一去提示词广场
  router.push(child.skillsPath || '/skills');
}
const importJsonInput = ref<HTMLInputElement | null>(null);

const selectedNodeIds = computed(() =>
  nodes.value.filter((n: any) => n.selected && !isWorkflowGroupNode(n)).map((n: any) => String(n.id)),
);

function triggerImportJson() {
  moreMenuOpen.value = false;
  importJsonInput.value?.click();
}

function currentDocument() {
  return flowToGraph(nodes.value, edges.value, readFlowViewport());
}

async function applyDocumentToCanvas(
  doc: import('@ai-video-studio/shared').WorkflowDocument,
  mode: 'replace' | 'merge',
) {
  let next = doc;
  if (mode === 'merge') {
    const base = currentDocument();
    const pack = nodePackExportPackage({
      name: 'import',
      document: doc,
    });
    next = mergeNodePack(base, pack, { x: 120, y: 120 }).document;
  }
  const flow = graphToFlow(next, catalog.value);
  nodes.value = flow.nodes;
  edges.value = [];
  await nextTick();
  try {
    updateNodeInternals(flow.nodes.map((n) => n.id));
  } catch {
    /* ignore */
  }
  await nextTick();
  await hydrateEdges(flow.edges);
  markDirty();
  await save();
  fitCanvas();
}

async function onImportJsonFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const raw = JSON.parse(await file.text());
    const routed = routeImportedJson(raw, file.name.replace(/\.json$/i, '') || '导入');

    if (routed.kind === 'production') {
      ElMessage.warning('项目请到「项目」页导入；画布仅接受工作流 / 节点包 / Comfy');
      return;
    }

    if (routed.kind === 'comfy') {
      await ElMessageBox.alert(routed.summary, 'Comfy 导入报告', {
        confirmButtonText: routed.report.stats.mapped ? '合并进画布' : '知道了',
      });
      if (!routed.report.stats.mapped) return;
      const { value } = await ElMessageBox.confirm(
        '合并到当前画布，还是替换整图？',
        '导入方式',
        {
          distinguishCancelAndClose: true,
          confirmButtonText: '合并',
          cancelButtonText: '替换整图',
          type: 'info',
        },
      ).then(() => ({ value: 'merge' as const })).catch((action: string) => {
        if (action === 'cancel') return { value: 'replace' as const };
        throw action;
      });
      await applyDocumentToCanvas(routed.document, value);
      ElMessage.success(`Comfy 已${value === 'merge' ? '合并' : '替换'}（映射 ${routed.report.stats.mapped}）`);
      return;
    }

    const doc = routed.kind === 'nodepack' ? routed.pack.document : routed.document;
    if (!(doc.nodes || []).length) {
      ElMessage.warning('导入图为空');
      return;
    }
    const mode =
      routed.kind === 'nodepack'
        ? 'merge'
        : (
            await ElMessageBox.confirm('合并到当前画布，还是替换整图？', '导入方式', {
              distinguishCancelAndClose: true,
              confirmButtonText: '合并',
              cancelButtonText: '替换整图',
              type: 'info',
            })
              .then(() => 'merge' as const)
              .catch((action: string) => {
                if (action === 'cancel') return 'replace' as const;
                throw action;
              })
          );
    await applyDocumentToCanvas(doc, mode);
    ElMessage.success(routed.kind === 'nodepack' ? '节点包已合并' : '工作流已导入');
  } catch (e: any) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error(e?.response?.data?.message || e?.message || '导入失败');
  }
}

function exportAiVideoStudioJson() {
  moreMenuOpen.value = false;
  const w = {
    format: 'lumina-workflow-v1',
    exportedAt: new Date().toISOString(),
    workflow: {
      id: workflowId.value,
      name: name.value,
      description: '',
      graph: currentDocument(),
      tags: [],
      thumbUrl: '',
      isTemplate: false,
    },
  };
  downloadJson(w, `${(name.value || 'workflow').replace(/[\\/:*?"<>|]+/g, '_')}.json`);
  ElMessage.success('已导出 AIGC 视频工厂 JSON');
}

function exportComfyJson() {
  moreMenuOpen.value = false;
  const comfy = comfyExportPackage(currentDocument(), name.value);
  const unmapped = (comfy.extra as any)?.lumina?.unmapped?.length || 0;
  downloadJson(comfy, `${(name.value || 'workflow').replace(/[\\/:*?"<>|]+/g, '_')}-comfy.json`);
  ElMessage.success(
    unmapped
      ? `已导出 Comfy JSON（${unmapped} 个类型降级为 Note）`
      : '已导出 ComfyUI JSON',
  );
}

function exportFullNodePack() {
  moreMenuOpen.value = false;
  const pack = nodePackExportPackage({
    name: name.value || '节点包',
    description: '整图导出',
    tags: ['full'],
    document: currentDocument(),
  });
  downloadJson(pack, `${(name.value || 'pack').replace(/[\\/:*?"<>|]+/g, '_')}-nodepack.json`);
  ElMessage.success('已导出节点包');
}

function exportSelectionPack() {
  moreMenuOpen.value = false;
  closeMenu();
  let ids = selectedNodeIds.value;
  if (!ids.length && (menu.nodeId || selectedId.value)) {
    ids = [String(menu.nodeId || selectedId.value)];
  }
  if (!ids.length) {
    ElMessage.warning('请先选中节点');
    return;
  }
  const pack = nodePackFromSelection(currentDocument(), ids, `选区·${ids.length}`);
  downloadJson(pack, `selection-${ids.length}-nodepack.json`);
  ElMessage.success(`已导出选中 ${ids.length} 个节点为节点包`);
}

async function loadProductionChip() {
  productionLabel.value = '';
  productionProjectId.value = '';
  const id = productionId.value;
  if (!id) return;
  try {
    const p = await fetchProduction(id);
    productionLabel.value = p.name || id.slice(0, 8);
    productionProjectId.value = String(p.projectId || '').trim();
  } catch {
    productionLabel.value = id.slice(0, 8);
  }
}

async function publishCurrent() {
  publishing.value = true;
  try {
    await save();
    if (productionId.value) {
      const p = await fetchProduction(productionId.value);
      const post = await publishToDiscover({
        kind: 'production',
        title: p.name || name.value || '项目',
        description: p.description || '',
        thumbUrl: p.thumbUrl || '',
        sourceId: p.id,
        payload: productionExportPackage(p),
      });
      const url = `${window.location.origin}/share/${post.shareToken}`;
      await navigator.clipboard?.writeText(url);
      ElMessage.success('已发布到发现，分享链接已复制');
      return;
    }
    const w = await fetchWorkflow(workflowId.value);
    const post = await publishToDiscover({
      kind: w.isTemplate ? 'template' : 'workflow',
      title: w.name || name.value || '工作流',
      description: w.description || '',
      thumbUrl: w.thumbUrl || '',
      sourceId: w.id,
      payload: workflowExportPackage(w),
    });
    const url = `${window.location.origin}/share/${post.shareToken}`;
    await navigator.clipboard?.writeText(url);
    ElMessage.success('已发布到发现，分享链接已复制');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '发布失败');
  } finally {
    publishing.value = false;
  }
}

watch(productionId, () => {
  void loadProductionChip();
}, { immediate: true });
watch(
  () => scriptGenStore.lastCompletedAt,
  (at) => {
    if (!at) return;
    if (scriptGenStore.lastWorkflowId !== workflowId.value) return;
    const g = scriptGenStore.resultGraph;
    if (g) applyScriptGenResult(g);
  },
);
watch(
  () => route.query.run,
  (v) => {
    const qRun = String(v || '').trim();
    if (!qRun || bootLoading.value) return;
    runModalId.value = qRun;
    runModalOpen.value = true;
    router.replace({ path: route.path, query: {} });
  },
);
</script>

<style scoped>
.canvas-shell {
  height: 100%;
  position: relative;
  display: block;
  background: var(--studio-bg);
  color: var(--studio-text);
  overflow: hidden;
}
.stage {
  position: absolute;
  inset: 0;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.stage-top {
  position: absolute;
  top: 10px;
  left: 12px;
  right: 12px;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  pointer-events: none;
}
.top-left,
.top-right {
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: auto;
  min-width: 0;
}
.top-right {
  gap: 6px;
}
.top-stop,
.top-log,
.top-search,
.btn-chat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  border: 1px solid var(--studio-glass-3);
  border-radius: 10px;
  background: color-mix(in srgb, var(--studio-panel) 82%, transparent);
  color: var(--studio-text-strong);
  font: inherit;
  font-size: 12px;
  font-weight: 550;
  cursor: pointer;
  padding: 0 10px;
  backdrop-filter: blur(10px);
}
.top-stop {
  color: #fff;
  background: rgba(239, 68, 68, 0.92);
  border-color: rgba(239, 68, 68, 0.55);
  font-weight: 650;
}
.top-stop:hover {
  background: #dc2626;
  color: #fff;
}
.top-stop .stop-sq {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: currentColor;
}
.top-log,
.top-search {
  width: 34px;
  height: 34px;
  padding: 0;
  justify-content: center;
  border-radius: 999px;
  color: var(--studio-text-strong);
  position: relative;
}
.top-log:hover,
.top-search:hover {
  color: #fff;
  background: color-mix(in srgb, var(--studio-panel) 92%, transparent);
}
.top-log.on,
.top-search.on,
.btn-chat.on {
  border-color: var(--studio-line-bright);
  background: var(--studio-glass-3);
}
.top-log.active,
.top-log.queued,
.top-log.running {
  border-color: rgba(96, 165, 250, 0.45);
  color: #93c5fd;
}
.top-log.failed {
  border-color: rgba(248, 113, 113, 0.45);
  color: #fca5a5;
}
.log-dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #34d399;
  box-shadow: 0 0 0 2px var(--studio-panel-3);
}
.log-dot.failed {
  background: #f87171;
}
.log-dot.cancelled {
  background: #fbbf24;
}
.log-dot.active,
.log-dot.queued,
.log-dot.running {
  background: #60a5fa;
  animation: log-pulse 1.2s ease infinite;
}
.log-dot.completed {
  background: #34d399;
}
@keyframes log-pulse {
  50% {
    opacity: 0.45;
  }
}
.btn-chat {
  background: color-mix(in srgb, var(--studio-panel) 82%, transparent);
  color: #fff;
  border-color: var(--studio-line-strong);
  font-weight: 650;
}
.btn-chat:hover {
  background: color-mix(in srgb, var(--studio-panel) 92%, transparent);
  color: #fff;
}
.icon-ghost {
  width: 34px;
  height: 34px;
  border: 1px solid var(--studio-glass-3);
  border-radius: 10px;
  background: color-mix(in srgb, var(--studio-panel) 82%, transparent);
  color: var(--studio-text-strong);
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
}
.icon-ghost:hover {
  color: #fff;
  background: color-mix(in srgb, var(--studio-panel) 92%, transparent);
}
.export-wrap {
  position: relative;
}
.export-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 80;
  min-width: 196px;
  padding: 6px;
  border-radius: 12px;
  border: 1px solid var(--studio-glass-3);
  background: var(--studio-panel);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: #f0f0f0;
}
.export-menu .menu-sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--studio-glass-2);
}
.export-menu button {
  border: 0;
  background: transparent;
  color: var(--studio-ink);
  text-align: left;
  padding: 9px 12px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.3;
  cursor: pointer;
  white-space: nowrap;
}
.export-menu button:hover:not(:disabled) {
  background: var(--studio-glass-2);
  color: #fff;
}
.export-menu button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.back {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 8px;
  background: color-mix(in srgb, var(--studio-panel) 82%, transparent);
  color: var(--studio-text-strong);
  cursor: pointer;
  display: inline-grid;
  place-items: center;
  padding: 0;
}
.back:hover {
  color: #fff;
  background: color-mix(in srgb, var(--studio-panel) 92%, transparent);
}
.wf-name {
  border: 0;
  background: transparent;
  color: var(--studio-text);
  font-size: 14px;
  font-weight: 650;
  padding: 6px 8px;
  border-radius: 8px;
  outline: none;
  min-width: 120px;
  max-width: 240px;
}
.wf-name:focus {
  background: color-mix(in srgb, var(--studio-panel) 70%, transparent);
}
.meta-chip,
.chip {
  font-size: 11px;
  color: var(--muted);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  padding: 4px 8px;
  border-radius: 999px;
  white-space: nowrap;
  border: 0;
  cursor: pointer;
  font-family: inherit;
}
.meta-chip.warn {
  color: var(--warn);
}
.meta-chip.gen {
  color: var(--info);
}
.meta-chip.prod {
  color: var(--accent);
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chip.completed {
  color: var(--ok);
}
.chip.active,
.chip.queued {
  color: var(--info);
}
.chip.failed {
  color: var(--danger);
}
.flow-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  outline: none;
  /* 对齐 updream：var(--studio-bg) + 48px 点阵 */
  background-color: var(--studio-bg);
  background-image: radial-gradient(circle, color-mix(in srgb, var(--studio-line-strong) 78%, transparent) 1px, transparent 1px);
  background-size: 48px 48px;
}
.flow-wrap.booting :deep(.vue-flow),
.flow-wrap.booting :deep(.vue-flow__minimap),
.flow-wrap.booting .empty-canvas {
  opacity: 0 !important;
  pointer-events: none !important;
}
.flow-wrap.genning :deep(.vue-flow),
.flow-wrap.genning :deep(.vue-flow__minimap),
.flow-wrap.genning .empty-canvas,
.flow-wrap.genning :deep(.canvas-dock) {
  pointer-events: none;
}
.boot-mask,
.gen-mask {
  position: absolute;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: var(--studio-bg);
  color: var(--studio-text-faint);
  pointer-events: all;
}
.gen-mask {
  background: color-mix(in srgb, var(--studio-panel) 82%, transparent);
  backdrop-filter: blur(2px);
}
.boot-mask em,
.gen-mask em {
  font-style: normal;
  font-size: 13px;
  letter-spacing: 0.02em;
}
.gen-mask p {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
  max-width: 280px;
  text-align: center;
  line-height: 1.5;
}
.boot-spin {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2.5px solid color-mix(in srgb, var(--muted) 28%, transparent);
  border-top-color: var(--accent);
  animation: boot-spin 0.8s linear infinite;
}
@keyframes boot-spin {
  to {
    transform: rotate(360deg);
  }
}
.flow-wrap.space-pan,
.flow-wrap.space-pan :deep(.vue-flow__pane) {
  cursor: grab;
}
.flow-wrap.space-pan:active,
.flow-wrap.space-pan:active :deep(.vue-flow__pane) {
  cursor: grabbing;
}
.flow-wrap :deep(.vue-flow) {
  width: 100%;
  height: 100%;
  background: transparent;
}
.flow-wrap :deep(.vue-flow__selection) {
  background: var(--accent-soft);
  border: 1px solid var(--accent-ring);
}
.flow-wrap :deep(.vue-flow__nodesselection-rect) {
  border-radius: 6px;
}
.flow-wrap :deep(.vue-flow__node-wfGroup) {
  padding: 0;
  border: none;
  background: transparent;
  box-shadow: none;
  /* 宽高交给节点 style / dimensions，勿写 auto，否则端口锚点会按矮内容盒计算 */
  overflow: visible;
}
/* 选中分组时禁用组内节点及其后代命中（子级 pointer-events:auto 会穿透父级 none） */
.flow-wrap :deep(.vue-flow__node.wf-group-member-inert),
.flow-wrap :deep(.vue-flow__node.wf-group-member-inert *) {
  pointer-events: none !important;
}
.flow-wrap :deep(.vue-flow__edges) {
  z-index: 2;
}
.flow-wrap :deep(.vue-flow__edge) {
  /* 连线始终压在节点下，选中时也不抬到节点正面 */
  z-index: 0 !important;
}
.flow-wrap :deep(.vue-flow__edge-path) {
  stroke: rgba(180, 180, 180, 0.55) !important;
  stroke-width: 1.85 !important;
  stroke-linecap: round;
  fill: none !important;
  opacity: 1 !important;
}
/* 选中节点相关连线：左入右出（始终沿 source→target 正向流动） */
.flow-wrap :deep(.vue-flow__edge.wf-edge-flow .vue-flow__edge-path) {
  stroke-width: 2.1 !important;
  stroke-dasharray: 7 10 !important;
  /* 正向 = 从 source 流向 target：入线进来、出线出去 */
  animation: wf-edge-transmit 0.75s linear infinite;
  filter: drop-shadow(0 0 2px rgba(186, 230, 253, 0.22));
}
.flow-wrap :deep(.vue-flow__edge.wf-edge-flow--in .vue-flow__edge-path) {
  stroke: rgba(187, 247, 208, 0.62) !important; /* 左侧传入 */
}
.flow-wrap :deep(.vue-flow__edge.wf-edge-flow--out .vue-flow__edge-path) {
  stroke: rgba(186, 230, 253, 0.62) !important; /* 右侧传出 */
}
.flow-wrap :deep(.vue-flow__edge.wf-edge-flow--both .vue-flow__edge-path) {
  stroke: rgba(224, 242, 254, 0.58) !important;
}
@keyframes wf-edge-transmit {
  to {
    stroke-dashoffset: -34;
  }
}
.flow-wrap :deep(.vue-flow__connection-path) {
  stroke: rgba(180, 180, 180, 0.65);
  stroke-width: 1.85;
}
.flow-wrap :deep(.vue-flow__nodes) {
  z-index: 3;
}
.flow-wrap :deep(.vue-flow__node-workflow),
.flow-wrap :deep(.vue-flow__node) {
  overflow: visible !important;
  cursor: default;
}
.flow-wrap :deep(.vue-flow__node.dragging) {
  cursor: grabbing;
}
.flow-wrap :deep(.vue-flow__edge-updater) {
  opacity: 0;
}
.empty-canvas {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  pointer-events: none;
  padding: 24px 16px 110px;
}
.flow-wrap.hide-edges :deep(.vue-flow__edges),
.flow-wrap.hide-edges :deep(.vue-flow__connectionline) {
  opacity: 0 !important;
  pointer-events: none !important;
}
.flow-wrap :deep(.vue-flow__minimap) {
  background: color-mix(in srgb, var(--studio-panel) 92%, transparent);
  border: 1px solid var(--studio-glass-2);
  border-radius: 10px;
  overflow: hidden;
  margin: 0 0 14px 14px !important;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
}
@media (max-width: 1100px) {
  .canvas-shell :deep(aside.palette) {
    bottom: 64px;
  }
  .canvas-shell :deep(aside.insp) {
    width: min(300px, calc(100% - 24px));
  }
}
</style>
