import api from '@/api';
import {
  ASSEMBLE_GROUP_META,
  ASSEMBLE_KIND_ORDER,
  composeAssembleIdea,
  deriveStyleBrief,
  resolveDraftPickOptions,
  type AssembleBlockKind,
  type AssembleOption,
} from '@/utils/assemble-blocks';
import { markOutlinePending } from '@/utils/outline-pending';
import { defaultStoryRoleByIndex, suggestImportStoryCamp } from '@/utils/story-roles';
import type { CharacterLibraryItem, ScriptLibraryItem } from '@/libraries';
import type { BookScale } from '@/utils/book-scale';
import { clampBookScale } from '@/utils/book-scale';

export type AssembleDraftPayload = {
  title: string;
  description: string;
  styleBrief: string;
  idea: string;
  script: ScriptLibraryItem;
  picks: Record<string, Array<{ id: string; label: string; blurb: string; preview: string }>>;
  notes?: string[];
  scale?: BookScale | null;
};

/**
 * 创建项目 → 立刻可跳转；素材与大纲后台落库。
 * 大纲任务写入 sessionStorage，概览页可展示进度。
 */
export async function createProjectFromAssembleDraft(
  draft: AssembleDraftPayload,
  opts?: {
    findScript?: (id: string) => ScriptLibraryItem | undefined;
    onNavigable?: (projectId: string) => void;
  },
): Promise<{ projectId: string }> {
  const script = opts?.findScript?.(draft.script.id) || draft.script;
  const localPicks: Partial<Record<AssembleBlockKind, AssembleOption[]>> = {};
  for (const kind of ASSEMBLE_KIND_ORDER) {
    localPicks[kind] = resolveDraftPickOptions(kind, draft.picks[kind] || []);
  }
  const notes = (draft.notes || []).map((s) => s.trim()).filter(Boolean);
  const scale = draft.scale ? clampBookScale(draft.scale) : null;
  let idea =
    composeAssembleIdea({ script, picks: localPicks, scale }) || draft.idea;
  if (notes.length) {
    idea = `${idea.trim()}\n\n【作者补充偏好】\n${notes.map((n, i) => `${i + 1}. ${n}`).join('\n')}`;
  }
  const styleBrief = deriveStyleBrief(localPicks) || draft.styleBrief || '';

  const { data: project } = await api.post('/projects', {
    title: draft.title.trim(),
    description: draft.description.trim() || script.idea,
    styleBrief,
    ...(scale
      ? { targetWordsWan: scale.wordsWan, volumeCount: scale.volumes }
      : {}),
  });
  const projectId = String(project.id || '');
  if (!projectId) throw new Error('创建成功但未返回项目 ID');

  opts?.onNavigable?.(projectId);
  markOutlinePending(projectId);

  const jobs: Promise<unknown>[] = [
    api.post(`/projects/${project.id}/assets/text`, {
      type: 'script',
      name: `积木拼装·${script.label}`,
      content: idea,
      prompt: idea,
    }),
  ];
  if (notes.length) {
    jobs.push(
      api.post(`/projects/${project.id}/assets/text`, {
        type: 'script',
        name: '作者补充偏好',
        content: notes.map((n, i) => `${i + 1}. ${n}`).join('\n'),
        prompt: idea,
      }),
    );
  }

  for (const kind of ASSEMBLE_KIND_ORDER) {
    for (const opt of localPicks[kind] || []) {
      const content = opt.preview || opt.blurb;
      jobs.push(
        api.post(`/projects/${project.id}/assets/text`, {
          type: kind === 'style' ? 'style' : kind === 'character' ? 'character_ref' : 'script',
          name: `${ASSEMBLE_GROUP_META[kind].title}·${opt.label}`,
          content,
          prompt: content,
        }),
      );
    }
  }

  const chars = localPicks.character || [];
  for (let i = 0; i < chars.length; i++) {
    const opt = chars[i];
    const raw = opt.raw;
    const role = defaultStoryRoleByIndex(i, chars.length);
    if (raw && 'description' in raw) {
      const c = raw as CharacterLibraryItem;
      jobs.push(
        api.post(`/projects/${project.id}/characters`, {
          name: c.label,
          description: c.description,
          consistencyPrompt: c.consistencyPrompt,
          meta: {
            role,
            occupation: '',
            camp: suggestImportStoryCamp(role),
            source: 'assemble',
            libraryId: c.id,
            libraryLabel: c.label,
          },
        }),
      );
    }
  }

  await Promise.allSettled(jobs);

  try {
    const { data: job } = await api.post(`/projects/${project.id}/script/generate-skeleton`, {
      idea,
      ...(scale
        ? { targetWordsWan: scale.wordsWan, volumeCount: scale.volumes }
        : {}),
    });
    markOutlinePending(projectId, String(job?.id || ''));
  } catch {
    markOutlinePending(projectId);
  }

  return { projectId };
}
