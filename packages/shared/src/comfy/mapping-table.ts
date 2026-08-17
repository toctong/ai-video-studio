/**
 * Comfy class_type → AIGC 视频工厂 节点映射。
 * 无法映射的（KSampler 等）在导入时进入 skipped 清单。
 */

export type ComfyPortMap = {
  /** Comfy 输入口名 → AIGC 视频工厂 targetHandle */
  inputs?: Record<string, string>;
  /** Comfy 输出口名 → AIGC 视频工厂 sourceHandle */
  outputs?: Record<string, string>;
};

export type ComfyClassMapping = {
  luminaType: string;
  /** widgets_values / inputs → params */
  mapParams: (ctx: {
    widgets: unknown[];
    inputs: Record<string, unknown>;
    title?: string;
  }) => Record<string, unknown>;
  ports?: ComfyPortMap;
  label?: string | ((ctx: { title?: string; widgets: unknown[] }) => string);
};

function firstString(widgets: unknown[], idx = 0, fallback = '') {
  const v = widgets[idx];
  return v == null ? fallback : String(v);
}

export const COMFY_CLASS_MAP: Record<string, ComfyClassMapping> = {
  CLIPTextEncode: {
    luminaType: 'input.text',
    mapParams: ({ widgets, inputs }) => ({
      value: String(inputs.text ?? widgets[0] ?? ''),
    }),
    ports: { outputs: { TEXT: 'text', CONDITIONING: 'text' } },
    label: ({ title, widgets }) => title || firstString(widgets).slice(0, 24) || '文本',
  },
  LoadImage: {
    luminaType: 'input.image',
    mapParams: ({ widgets, inputs }) => ({
      url: '',
      name: String(inputs.image ?? widgets[0] ?? 'comfy-image'),
      note: `Comfy LoadImage: ${String(inputs.image ?? widgets[0] ?? '')}`,
    }),
    ports: { outputs: { IMAGE: 'image', MASK: 'image' } },
    label: '加载图片',
  },
  LoadImageMask: {
    luminaType: 'input.image',
    mapParams: ({ widgets }) => ({
      url: '',
      name: firstString(widgets) || 'mask',
      note: 'Comfy LoadImageMask（蒙版未映射，请手动补图）',
    }),
    ports: { outputs: { MASK: 'image', IMAGE: 'image' } },
  },
  PreviewImage: {
    luminaType: 'output.preview',
    mapParams: () => ({}),
    ports: { inputs: { images: 'image', IMAGE: 'image' } },
    label: '预览',
  },
  SaveImage: {
    luminaType: 'output.preview',
    mapParams: ({ widgets }) => ({
      name: firstString(widgets) || 'save',
    }),
    ports: { inputs: { images: 'image', IMAGE: 'image' } },
    label: '保存预览',
  },
  ImageScale: {
    luminaType: 'input.note',
    mapParams: ({ widgets }) => ({
      value: `Comfy ImageScale（未执行）：${widgets.join(', ')}`,
    }),
  },
  LatentUpscale: {
    luminaType: 'input.note',
    mapParams: () => ({ value: 'Comfy LatentUpscale（AIGC 视频工厂 无 Latent 运行时，已降级为备注）' }),
  },
  EmptyLatentImage: {
    luminaType: 'input.note',
    mapParams: ({ widgets }) => {
      const w = Number(widgets[0]) || 512;
      const h = Number(widgets[1]) || 512;
      return {
        value: `EmptyLatent ${w}x${h}（请在 ai.image 节点设置比例/尺寸）`,
      };
    },
    label: '空 Latent→备注',
  },
  VAEDecode: {
    luminaType: 'input.note',
    mapParams: () => ({ value: 'Comfy VAEDecode（跳过执行，下游请接 ai.image / preview）' }),
  },
  VAEEncode: {
    luminaType: 'input.note',
    mapParams: () => ({ value: 'Comfy VAEEncode（跳过）' }),
  },
  // 常见视频扩展
  VHS_LoadVideo: {
    luminaType: 'input.video',
    mapParams: ({ widgets }) => ({
      url: '',
      name: firstString(widgets) || 'comfy-video',
      note: `Comfy VHS_LoadVideo: ${firstString(widgets)}`,
    }),
    ports: { outputs: { IMAGE: 'video', video: 'video' } },
    label: '加载视频',
  },
  VHS_VideoCombine: {
    luminaType: 'ai.video',
    mapParams: ({ widgets }) => ({
      prompt: '（从 Comfy VHS_VideoCombine 导入，请补全提示词与参考图）',
      name: firstString(widgets, 0, 'comfy-video'),
      refMode: 'omni',
    }),
    ports: {
      inputs: {
        images: 'image',
        IMAGE: 'image',
        text: 'prompt',
        prompt: 'prompt',
      },
      outputs: { Filenames: 'video', video: 'video' },
    },
    label: '视频合成→AI视频',
  },
  // 文本实用
  StringConstant: {
    luminaType: 'input.text',
    mapParams: ({ widgets, inputs }) => ({
      value: String(inputs.string ?? inputs.value ?? widgets[0] ?? ''),
    }),
    ports: { outputs: { STRING: 'text', string: 'text' } },
  },
  PrimitiveString: {
    luminaType: 'input.text',
    mapParams: ({ widgets }) => ({ value: firstString(widgets) }),
    ports: { outputs: { STRING: 'text' } },
  },
  ShowText: {
    luminaType: 'output.preview',
    mapParams: () => ({}),
    ports: { inputs: { text: 'text', STRING: 'text' } },
    label: '文本预览',
  },
  Reroute: {
    luminaType: 'input.note',
    mapParams: () => ({ value: 'Comfy Reroute（已省略，边会尽量直连）' }),
  },
  Note: {
    luminaType: 'input.note',
    mapParams: ({ widgets }) => ({ value: firstString(widgets) || 'Note' }),
    label: '备注',
  },
  MarkdownNote: {
    luminaType: 'input.note',
    mapParams: ({ widgets }) => ({ value: firstString(widgets) || 'Markdown' }),
  },
  // 常见自定义 / 图生图入口 → 备注或生图占位
  ImageToImage: {
    luminaType: 'ai.image',
    mapParams: ({ widgets, inputs }) => ({
      prompt: String(inputs.prompt ?? widgets[0] ?? '（Comfy ImageToImage，请补提示词）'),
      name: 'comfy-i2i',
    }),
    ports: {
      inputs: { image: 'image', IMAGE: 'image', images: 'image', text: 'prompt', prompt: 'prompt' },
      outputs: { IMAGE: 'image', image: 'image' },
    },
    label: '图生图→AI生图',
  },
  CR_Text: {
    luminaType: 'input.text',
    mapParams: ({ widgets, inputs }) => ({
      value: String(inputs.text ?? inputs.string ?? widgets[0] ?? ''),
    }),
    ports: { outputs: { text: 'text', STRING: 'text' } },
  },
};

/** 明确跳过（不建备注节点，只进清单） */
export const COMFY_SKIP_CLASSES = new Set([
  'KSampler',
  'KSamplerAdvanced',
  'SamplerCustom',
  'CheckpointLoaderSimple',
  'CheckpointLoader',
  'LoraLoader',
  'LoraLoaderModelOnly',
  'ControlNetLoader',
  'ControlNetApply',
  'ControlNetApplyAdvanced',
  'CLIPSetLastLayer',
  'CLIPLoader',
  'UNETLoader',
  'VAELoader',
  'DualCLIPLoader',
  'ConditioningCombine',
  'ConditioningConcat',
  'ConditioningSetArea',
  'LatentComposite',
  'RepeatLatentBatch',
]);

export function resolveComfyMapping(classType: string): ComfyClassMapping | null {
  const key = String(classType || '').trim();
  if (!key) return null;
  if (COMFY_CLASS_MAP[key]) return COMFY_CLASS_MAP[key];
  // 模糊：*TextEncode* → input.text
  if (/TextEncode|CLIPText/i.test(key) && !/SetLastLayer/i.test(key)) {
    return COMFY_CLASS_MAP.CLIPTextEncode;
  }
  if (/^LoadImage/i.test(key)) return COMFY_CLASS_MAP.LoadImage;
  if (/SaveImage|PreviewImage/i.test(key)) return COMFY_CLASS_MAP.SaveImage;
  if (/VideoCombine|ImageToVideo|SVD_img2vid/i.test(key)) return COMFY_CLASS_MAP.VHS_VideoCombine;
  if (/ImageToImage|img2img/i.test(key)) return COMFY_CLASS_MAP.ImageToImage;
  if (/StringConstant|PrimitiveString|CR_Text|TextLiteral/i.test(key)) {
    return COMFY_CLASS_MAP.StringConstant;
  }
  return null;
}
