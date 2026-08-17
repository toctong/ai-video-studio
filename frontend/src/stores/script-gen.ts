import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { chatCompletion } from '@/api/ai-chat';
import { expandShot } from '@/api/libraries';
import { fetchWorkflow, runWorkflow, updateWorkflow } from '@/api/workflows';
import { resolveAssetProjectId } from '@/constants/studio';
import type { WorkflowDocument } from '@ai-video-studio/shared';
import {
  SCRIPT_GEN_SYSTEM,
  buildScriptLayoutFragment,
  buildShotExpandLayoutFragment,
} from '@/utils/script-gen-layout';

export type ScriptGenMode = 'script' | 'shot' | 'character' | 'manual';

export type ScriptGenRequest = {
  workflowId: string;
  workflowName?: string;
  mode: ScriptGenMode;
  prompt: string;
  model?: string;
  styleLabel?: string;
  styleBrief?: string;
  characterLabel?: string;
  characterBrief?: string;
  shotLabel?: string;
  shotBrief?: string;
  /** 镜头库条目 id：有则走细案 expand API */
  shotId?: string;
  /** 镜头库画风族，如 国风东方 / 奇幻暗黑怪异 */
  category?: string;
  /** 子风格，如 水墨 / 岩彩（通常来自 tags[0]） */
  subStyle?: string;
  tags?: string[];
  /** 成片目标时长：10 或 15 秒 */
  targetDurationSec?: 10 | 15;
  /** 手动模式已写好的脚本；AI 模式可省略 */
  scriptText?: string;
  /** 画布仍打开时传入当前图，避免离页前未保存的改动丢失 */
  liveGraph?: WorkflowDocument | null;
  /** 细案落盘后立刻整图执行（工作室镜头库一键启动） */
  autoRun?: boolean;
  /** 执行时用的项目桶；默认平台遗留桶 */
  projectId?: string;
  /** 成片参考：默认 omni；keyframe = 高级三关键帧模板 */
  videoRefMode?: 'omni' | 'keyframe';
};

/**
 * 脚本生成挂在全局 store：确认后关弹窗即可离开画布，请求不 abort。
 */
export const useScriptGenStore = defineStore('scriptGen', () => {
  const workflowId = ref('');
  const workflowName = ref('');
  const status = ref('');
  const running = ref(false);
  const error = ref('');
  const lastCompletedAt = ref(0);
  const lastWorkflowId = ref('');
  const lastRunId = ref('');
  const resultGraph = ref<WorkflowDocument | null>(null);
  let runToken = 0;

  const isRunning = computed(() => running.value);

  function isRunningFor(wid: string) {
    return running.value && workflowId.value === wid;
  }

  function resetSoft() {
    running.value = false;
    status.value = '';
    error.value = '';
    workflowId.value = '';
    workflowName.value = '';
  }

  function normalizeDuration(sec?: number): 10 | 15 {
    return Number(sec) === 15 ? 15 : 10;
  }

  function pickSubStyle(req: ScriptGenRequest) {
    const fromReq = String(req.subStyle || '').trim();
    if (fromReq) return fromReq;
    const tags = req.tags || [];
    return (
      tags.find((t) => {
        const s = String(t || '').trim();
        return s && s !== '画风' && s !== '动漫风';
      }) || ''
    );
  }

  function buildUserMessage(req: ScriptGenRequest) {
    const parts: string[] = [];
    const dur = normalizeDuration(req.targetDurationSec);
    const subStyle = pickSubStyle(req);
    parts.push(`成片总时长要求：严格按约 ${dur} 秒写【总时长】，各分镜时长之和接近 ${dur} 秒。`);
    parts.push(
      '只禁真人：禁止真实人脸、真人演员、live-action、照片级皮肤；画风跟镜头库族/子风格走，禁止无依据默认动画开脸/赛璐璐。',
    );
    if (req.category || subStyle) {
      parts.push(
        `镜头库画风族硬锁：${[req.category, subStyle].filter(Boolean).join('·')}（子风格只作色板/特效，禁止串风、禁止真人）。`,
      );
    }
    if (req.styleLabel || req.styleBrief) {
      parts.push(`画风设定：${req.styleLabel || ''}`.trim());
      if (req.styleBrief) parts.push(req.styleBrief);
    }
    if (req.shotLabel || req.shotBrief) {
      parts.push(`镜头概念：${req.shotLabel || ''}`.trim());
      if (req.shotBrief) parts.push(req.shotBrief);
    }
    if (req.characterLabel || req.characterBrief) {
      parts.push(`角色设定：${req.characterLabel || ''}`.trim());
      if (req.characterBrief) parts.push(req.characterBrief);
    }
    parts.push(`用户需求：\n${req.prompt.trim()}`);
    return parts.join('\n\n');
  }

  async function resolveScriptText(req: ScriptGenRequest, token: number) {
    if (req.mode === 'manual') {
      let scriptText = String(req.scriptText || req.prompt || '').trim();
      if (req.styleBrief || req.characterBrief || req.shotBrief) {
        scriptText = [
          req.styleBrief ? `画风：${req.styleLabel || ''}\n${req.styleBrief}` : '',
          req.shotBrief ? `镜头：${req.shotLabel || ''}\n${req.shotBrief}` : '',
          req.characterBrief ? `角色：${req.characterLabel || ''}\n${req.characterBrief}` : '',
          req.prompt.trim(),
        ]
          .filter(Boolean)
          .join('\n\n');
      }
      return scriptText;
    }

    const dur = normalizeDuration(req.targetDurationSec);
    const subStyle = pickSubStyle(req);
    status.value = 'AI 正在写分镜脚本…';
    const styleLock = [req.category, subStyle].filter(Boolean).join('·') || '概念美术';
    const focus =
      req.mode === 'shot'
        ? `请把镜头库概念扩写成完整短片预案：画风硬锁「${styleLock}」（只禁真人，禁止默认赛璐璐；仅二次元族才写动画开脸）。【角色】外形锚点要写密（脸/发/装/标志色），供定妆出图。先写【角色】【剧情】【总时长】约 ${dur} 秒与「画风：」行，再写 3～6 个带时长的分镜行（关键帧多图 + 一条成片视频）。突出运镜与特效，镜间衔接要紧凑，各镜时长之和接近 ${dur} 秒。`
        : req.mode === 'character'
          ? `请以角色为驱动写分镜：画风硬锁「${styleLock}」（只禁真人，禁止默认赛璐璐）。【角色】外形写密供定妆。先写【角色】【剧情】【总时长】约 ${dur} 秒，再写分镜行（将合并为一条成片），突出人物动作与情绪，总时长贴近 ${dur} 秒。`
          : `请以剧情推进写分镜：画风硬锁「${styleLock}」（只禁真人，禁止默认赛璐璐）。【角色】外形写密供定妆。先写【角色】【剧情】【总时长】约 ${dur} 秒，再写分镜行（将合并为一条成片），镜头衔接紧凑，总时长贴近 ${dur} 秒。`;

    const scriptText = await chatCompletion(
      [
        { role: 'system', content: `${SCRIPT_GEN_SYSTEM}\n${focus}` },
        { role: 'user', content: buildUserMessage(req) },
      ],
      req.model || undefined,
    );
    if (token !== runToken) return '';
    if (!scriptText.trim()) throw new Error('模型未返回内容');
    return scriptText.trim();
  }

  async function start(req: ScriptGenRequest) {
    if (running.value) {
      ElMessage.warning('已有脚本正在生成，请稍候');
      return;
    }
    const wid = String(req.workflowId || '').trim();
    if (!wid) {
      ElMessage.error('工作流无效');
      return;
    }
    const shotId = String(req.shotId || '').trim();
    if (!shotId && !String(req.prompt || '').trim() && req.mode !== 'manual') {
      ElMessage.warning('请先描述剧情或编写脚本');
      return;
    }

    const token = ++runToken;
    running.value = true;
    workflowId.value = wid;
    workflowName.value = String(req.workflowName || '');
    error.value = '';
    resultGraph.value = null;
    status.value = shotId
      ? 'AI 正在扩写镜头细案…'
      : req.mode === 'manual'
        ? '正在落到画布…'
        : 'AI 正在写分镜脚本…';

    try {
      const duration = normalizeDuration(req.targetDurationSec);
      const subStyle = pickSubStyle(req);
      let fragment: {
        nodes: WorkflowDocument['nodes'];
        edges: WorkflowDocument['edges'];
        groups: WorkflowDocument['groups'];
      };
      let layoutKind = 'portrait_keyframes_single_video';

      if (shotId) {
        status.value = 'AI 正在扩写定妆 + 场景 + 成片提示词…';
        const expand = await expandShot(shotId, {
          model: req.model || undefined,
          durationSec: duration,
        });
        if (token !== runToken) return;
        if (!String(expand?.videoPrompt || '').trim()) {
          throw new Error('细案未返回成片提示词');
        }
        status.value = '正在排布设定板、分镜宫格与全能参考成片…';
        const styleLock = String(req.styleBrief || '').trim();
        fragment = buildShotExpandLayoutFragment({
          label: expand.label || req.shotLabel || '镜头细案',
          category: expand.category || req.category || '',
          subStyle,
          styleBrief: req.styleBrief,
          styleLock: styleLock || undefined,
          tags: req.tags,
          durationSec: normalizeDuration(expand.durationSec || duration),
          videoPrompt: expand.videoPrompt,
          storyPlot: expand.storyPlot || '',
          plotGridPrompt: expand.plotGridPrompt || '',
          characters: expand.characters || [],
          scene: expand.scene,
          videoRefMode: req.videoRefMode === 'keyframe' ? 'keyframe' : 'omni',
        });
        layoutKind =
          req.videoRefMode === 'keyframe'
            ? 'libtv_sheet_plot_keyframe_video'
            : 'libtv_sheet_plot_omni_video';
      } else {
        const scriptText = await resolveScriptText(req, token);
        if (token !== runToken) return;
        if (!scriptText) throw new Error('脚本为空');

        status.value = '正在排布成片节点…';
        fragment = buildScriptLayoutFragment({
          scriptText,
          styleBrief: req.styleBrief,
          shotLabel: req.shotLabel,
          category: req.category,
          subStyle,
          targetDurationSec: duration,
        });
      }

      let base: WorkflowDocument | null = req.liveGraph || null;
      if (!base) {
        status.value = '正在写入工作流…';
        const w = await fetchWorkflow(wid);
        if (token !== runToken) return;
        base = (w.graph as WorkflowDocument) || null;
        if (!workflowName.value) workflowName.value = w.name || '';
      }

      const finalDuration =
        shotId && fragment
          ? Number(
              (fragment.nodes || []).find((n) => n.type === 'ai.video')?.params?.durationSec,
            ) === 15
            ? 15
            : duration
          : duration;

      const finalGraph: WorkflowDocument = {
        schemaVersion: 2,
        nodes: fragment.nodes,
        edges: fragment.edges,
        groups: fragment.groups,
        viewport: (base as any)?.viewport,
        meta: {
          ...((base as any)?.meta || {}),
          kind:
            String((base as any)?.meta?.kind || '') ||
            (shotId || req.shotLabel ? 'shot_library_entry' : 'script_gen'),
          shotId: shotId || (base as any)?.meta?.shotId || '',
          shotLabel: req.shotLabel || (base as any)?.meta?.shotLabel || '',
          category: req.category || (base as any)?.meta?.category || '',
          subStyle: subStyle || (base as any)?.meta?.subStyle || '',
          scriptLayout: layoutKind,
          targetDurationSec: finalDuration,
        },
      };
      await updateWorkflow(wid, { graph: finalGraph });
      if (token !== runToken) return;

      resultGraph.value = finalGraph;
      lastWorkflowId.value = wid;
      lastCompletedAt.value = Date.now();
      const label = workflowName.value ? `「${workflowName.value}」` : '工作流';
      const nPortrait = (fragment.groups || []).filter((g) => /^② 定妆/.test(g.title)).length;
      const hasScene = (fragment.groups || []).some((g) => /^③ 场景/.test(g.title));
      const nExpandKf = (fragment.groups || []).filter((g) => /^④[abc] 关键帧/.test(g.title)).length;
      const nFrame = (fragment.groups || []).filter((g) => /^③ 镜/.test(g.title)).length;
      const layoutSummary = shotId
        ? `${nPortrait ? `${nPortrait} 张定妆` : '定妆'}${
            hasScene ? ' + 场景' : ''
          }${nExpandKf ? ` + ${nExpandKf} 关键帧` : ''} + 1 条 ${finalDuration}s 成片（开场→首帧、中景→参考、收束→尾帧）`
        : `${nPortrait ? `${nPortrait} 张定妆 + ` : ''}${nFrame} 张关键帧 + 1 条 ${finalDuration}s 成片（定妆锁脸）`;

      if (req.autoRun) {
        status.value = '细案已落盘，正在启动执行…';
        const { workflowRun } = await runWorkflow(wid, {
          projectId: resolveAssetProjectId({ projectId: req.projectId }),
          inputs: {},
        });
        if (token !== runToken) return;
        lastRunId.value = String(workflowRun?.id || '');
        ElMessage.success(`${label}已启动执行：${layoutSummary}`);
      } else if (shotId) {
        ElMessage.success(`${label}已生成：${layoutSummary}`);
      } else {
        ElMessage.success(`${label}已生成：${layoutSummary}`);
      }
      resetSoft();
    } catch (e: any) {
      if (token !== runToken) return;
      error.value = e?.response?.data?.message || e?.message || '生成失败';
      ElMessage.error(error.value);
      resetSoft();
    }
  }

  return {
    workflowId,
    workflowName,
    status,
    running: isRunning,
    error,
    lastCompletedAt,
    lastWorkflowId,
    lastRunId,
    resultGraph,
    isRunningFor,
    start,
  };
});
