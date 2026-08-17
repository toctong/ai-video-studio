import type { WorkflowDocument, WorkflowGraph } from '@ai-video-studio/shared';

/** Skill 广场「使用」：画布落一个 Agent（ai.chat）节点，不是文本节点 */
export function homeAgentSkillGraph(opts: {
  name?: string;
  prompt: string;
  system?: string;
  skillId?: string;
  slash?: string;
}): WorkflowDocument {
  const name = String(opts.name || '').trim() || 'Agent';
  const prompt = String(opts.prompt || '').trim() || name;
  const system = String(opts.system || '').trim();
  return {
    schemaVersion: 2,
    nodes: [
      {
        id: 'agent',
        type: 'ai.chat' as const,
        label: name,
        position: { x: 220, y: 140 },
        params: {
          model: '',
          system:
            system ||
            '你是有用的创作助手，可基于参考图与画布上下文协助创作。',
          prompt,
          referenceImage: '',
          agentMode: 'agent',
          skillId: String(opts.skillId || '').trim(),
          slash: String(opts.slash || '').trim(),
          timeoutMs: 120_000,
        },
        mode: 'active' as const,
      },
    ],
    edges: [],
    groups: [],
  };
}

/** 首页开单：文本节点 + 生图 / 生视频（连线把文案交给媒体） */
export function homePromptWorkflowGraph(
  prompt = '',
  opts?: {
    mode?: 'image' | 'video';
    label?: string;
    referenceImage?: string;
    aspect?: string;
    model?: string;
    quality?: string;
    durationSec?: number;
    refMode?: string;
    count?: number;
  },
): WorkflowDocument {
  const value = String(prompt || '').trim() || '描述你想要的画面…';
  const mode = opts?.mode === 'video' ? 'video' : 'image';
  const textLabel =
    String(opts?.label || '').trim() || (mode === 'video' ? '视频提示词' : '图片提示词');
  const referenceImage = String(opts?.referenceImage || '').trim();
  const aspectRaw = String(opts?.aspect || '').trim();
  const aspect =
    !aspectRaw || aspectRaw === 'auto' ? '16:9' : aspectRaw;
  const model = String(opts?.model || '').trim();
  const quality = String(opts?.quality || '').trim().toLowerCase();
  const size =
    quality === '4k'
      ? '4K'
      : quality === '2k' || quality === '1.5k'
        ? '2K'
        : quality === '1k'
          ? '1K'
          : '1K';
  const durationSec = Math.max(1, Number(opts?.durationSec) || 5);
  const refModeRaw = String(opts?.refMode || '').trim().toLowerCase();
  const refMode =
    refModeRaw === 'frames' || refModeRaw === 'omni' || refModeRaw === 'text'
      ? refModeRaw
      : referenceImage
        ? 'frames'
        : 'text';
  const resolution =
    quality === '1080p' ? '1080p' : quality === '720p' ? '720p' : '480p';
  const count = Math.min(4, Math.max(1, Number(opts?.count) || 1));

  const textNode = {
    id: 'txt',
    type: 'input.text' as const,
    label: textLabel,
    position: { x: 60, y: 120 },
    params: {
      value,
      inputKey: '',
      referenceImage,
    },
    mode: 'active' as const,
  };

  if (mode === 'video') {
    return {
      schemaVersion: 2,
      nodes: [
        textNode,
        {
          id: 'vid',
          type: 'ai.video' as const,
          label: '',
          position: { x: 420, y: 80 },
          params: {
            model,
            durationSec,
            name: '',
            prompt: value,
            endImage: '',
            referenceImage,
            aspect,
            resolution,
            refMode: referenceImage && refMode === 'text' ? 'frames' : refMode,
          },
          mode: 'active' as const,
        },
      ],
      edges: [
        {
          id: 'e_txt_vid',
          source: 'txt',
          sourceHandle: 'text',
          target: 'vid',
          targetHandle: 'image',
        },
      ],
      groups: [],
    };
  }

  return {
    schemaVersion: 2,
    nodes: [
      textNode,
      {
        id: 'img',
        type: 'ai.image' as const,
        label: '',
        position: { x: 420, y: 80 },
        params: {
          model,
          name: '',
          prompt: value,
          referenceImage,
          aspect,
          size,
          imageGrid: String(count),
          assetType: '',
        },
        mode: 'active' as const,
      },
    ],
    edges: [
      {
        id: 'e_txt_img',
        source: 'txt',
        sourceHandle: 'text',
        target: 'img',
        targetHandle: 'image',
      },
    ],
    groups: [],
  };
}

/** 默认管线：生图（自带提示词）→ 视频；无独立文本节点 */
export function defaultMediaPipelineGraph(
  prompt = '',
  opts?: { referenceImage?: string; mode?: 'agent' | 'image' | 'video' },
): WorkflowDocument {
  const value = prompt || '国风少年拔刀释放大招，特写剑光，动漫风';
  const ref = String(opts?.referenceImage || '').trim();
  const mode = opts?.mode || 'agent';

  const imgNode = {
    id: 'img',
    type: 'ai.image' as const,
    label: '',
    position: { x: 80, y: 80 },
    params: {
      model: '',
      name: '',
      prompt: value,
      referenceImage: ref,
    },
    mode: 'active' as const,
  };

  const vidNode = {
    id: 'vid',
    type: 'ai.video' as const,
    label: '',
    position: { x: 400, y: 80 },
    params: {
      model: '',
      durationSec: 5,
      name: '',
      prompt: value,
      endImage: '',
      referenceImage: mode === 'video' ? ref : '',
    },
    mode: 'active' as const,
  };

  if (mode === 'image') {
    return {
      schemaVersion: 2,
      nodes: [imgNode],
      edges: [],
      groups: [],
    };
  }

  if (mode === 'video') {
    return {
      schemaVersion: 2,
      nodes: [{ ...vidNode, position: { x: 80, y: 80 } }],
      edges: [],
      groups: [],
    };
  }

  // agent：生图 → 视频（首帧）
  return {
    schemaVersion: 2,
    nodes: [imgNode, vidNode],
    edges: [
      {
        id: 'e_img_vid',
        source: 'img',
        sourceHandle: 'image',
        target: 'vid',
        targetHandle: 'image',
      },
    ],
    groups: [],
  };
}

/** @deprecated alias */
export type { WorkflowGraph };
