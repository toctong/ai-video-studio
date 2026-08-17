import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { fetchSseJson } from '@/utils/fetch-sse';

export type ChapterDraft = {
  id: string;
  title: string;
  orderIndex?: number;
  synopsis: string;
  novelBody: string;
  continuitySummary: string;
  status: string;
  chapterCard: Record<string, unknown>;
};

type StartOpts = {
  projectId: string;
  chapterId?: string;
  model?: string;
  instruction?: string;
  finale?: boolean;
};

/**
 * 章节流式生成挂在全局 store：切菜单不 abort；
 * 支持连写多章（串行，每章吃上一章承接，保证连贯）。
 */
export const useChapterGenStore = defineStore('chapterGen', () => {
  const projectId = ref('');
  const chapterId = ref('');
  const status = ref('');
  const draft = ref<ChapterDraft | null>(null);
  const running = ref(false);
  const lastCompletedAt = ref(0);
  const lastChapterId = ref('');
  const finale = ref(false);
  /** 连写：总数 / 当前序号（0 表示非连写） */
  const batchTotal = ref(0);
  const batchIndex = ref(0);
  let abort: AbortController | null = null;
  let runToken = 0;

  const isRunning = computed(() => running.value);

  function isRunningFor(pid: string) {
    return running.value && projectId.value === pid;
  }

  function resetSoft() {
    running.value = false;
    status.value = '';
    abort = null;
    projectId.value = '';
    chapterId.value = '';
    draft.value = null;
    finale.value = false;
    batchTotal.value = 0;
    batchIndex.value = 0;
  }

  function cancel() {
    if (!running.value) return;
    status.value = '正在停止…';
    abort?.abort();
  }

  function throwIfAborted(signal: AbortSignal) {
    if (signal.aborted) {
      const err = new Error('已取消');
      err.name = 'AbortError';
      throw err;
    }
  }

  async function runOneStream(
    opts: StartOpts,
    token: number,
    signal: AbortSignal,
    statusPrefix = '',
  ) {
    const prefix = statusPrefix ? `${statusPrefix} · ` : '';
    chapterId.value = String(opts.chapterId || '');
    draft.value = null;
    finale.value = Boolean(opts.finale);
    status.value = `${prefix}${opts.finale ? '准备完结章…' : '准备开始…'}`;

    await fetchSseJson(`/projects/${opts.projectId}/chapters/generate-stream`, {
      body: {
        model: opts.model,
        chapterId: opts.chapterId,
        instruction: opts.instruction || undefined,
      },
      signal,
      onEvent: async (ev) => {
        if (token !== runToken) return;
        if (ev?.type === 'start') {
          chapterId.value = String(ev.chapterId || '');
          draft.value = {
            id: ev.chapterId,
            title: ev.title || `第${ev.orderIndex}章`,
            orderIndex: ev.orderIndex,
            synopsis: '',
            novelBody: '',
            continuitySummary: '',
            status: 'draft',
            chapterCard: {},
          };
          status.value = `${prefix}${
            ev.rewrite
              ? '正在重写正文…'
              : opts.finale
                ? '正在撰写完结章…'
                : '正在撰写正文…'
          }`;
        } else if (ev?.type === 'status') {
          status.value = `${prefix}${ev.message || status.value.replace(prefix, '')}`;
        } else if (ev?.type === 'delta') {
          if (!draft.value) return;
          draft.value = {
            ...draft.value,
            novelBody: `${draft.value.novelBody || ''}${ev.text || ''}`,
          };
        } else if (ev?.type === 'meta') {
          if (!draft.value) return;
          const next = { ...draft.value };
          if (ev.title) next.title = ev.title;
          if (ev.synopsis != null) next.synopsis = ev.synopsis;
          if (ev.continuitySummary != null) next.continuitySummary = ev.continuitySummary;
          if (ev.chapterCard) {
            next.chapterCard = ev.chapterCard;
            status.value = `${prefix}${
              !String(next.novelBody || '').trim()
                ? '已规划本章，正在撰写…'
                : '正在收尾保存…'
            }`;
          } else {
            status.value = `${prefix}正在收尾保存…`;
          }
          draft.value = next;
        } else if (ev?.type === 'done') {
          const ch = ev.chapter;
          if (ch?.id) {
            draft.value = {
              id: ch.id,
              title: ch.title || draft.value?.title || '未命名章节',
              orderIndex: ch.orderIndex,
              synopsis: ch.synopsis || '',
              novelBody: ch.novelBody || '',
              continuitySummary: ch.continuitySummary || '',
              status: ch.status || 'draft',
              chapterCard: { ...(ch.chapterCard || {}) },
            };
            chapterId.value = ch.id;
          }
          status.value = `${prefix}${opts.finale ? '完结章已生成' : '本章完成'}`;
        } else if (ev?.type === 'error') {
          throw new Error(ev.message || '生成失败');
        }
      },
    });

    throwIfAborted(signal);
    if (token !== runToken) return;
    lastChapterId.value = chapterId.value;
    lastCompletedAt.value = Date.now();
  }

  async function start(opts: StartOpts) {
    if (running.value) {
      throw new Error('已有章节正在生成，请等待完成或先停止');
    }

    const ac = new AbortController();
    abort = ac;
    const token = ++runToken;
    running.value = true;
    projectId.value = opts.projectId;

    try {
      await runOneStream(opts, token, ac.signal);
      if (token !== runToken) return;
      ElMessage.success(
        opts.finale ? '完结章已生成' : opts.chapterId ? '章节已重写' : '章节已生成',
      );
      resetSoft();
    } catch (e: any) {
      if (token !== runToken) return;
      const aborted =
        e?.name === 'AbortError' || /cancel|abort|取消/i.test(String(e?.message || ''));
      if (aborted) {
        ElMessage.info('已停止生成（已写出的正文仍保留在草稿里）');
        lastChapterId.value = chapterId.value;
        lastCompletedAt.value = Date.now();
      } else {
        ElMessage.error(e?.message || '生成失败');
      }
      resetSoft();
    }
  }

  /**
   * 串行连写多章：每一章完成后，下一章请求会带上已落库的前文+承接摘要，
   * 由后端 continuity / timeline / openHooks 保证逻辑衔接。
   * mode=wrap：收束连写，前几章消化悬念/钩子，末章才完结全书。
   */
  async function startBatch(opts: {
    projectId: string;
    count: number;
    model?: string;
    mode?: 'normal' | 'wrap';
  }) {
    if (running.value) {
      throw new Error('已有章节正在生成，请等待完成或先停止');
    }
    const wrap = opts.mode === 'wrap';
    const count = wrap
      ? Math.min(12, Math.max(2, Math.floor(Number(opts.count) || 5)))
      : Math.min(20, Math.max(2, Math.floor(Number(opts.count) || 10)));

    const ac = new AbortController();
    abort = ac;
    const token = ++runToken;
    running.value = true;
    projectId.value = opts.projectId;
    batchTotal.value = count;
    batchIndex.value = 0;

    let done = 0;
    try {
      for (let i = 1; i <= count; i++) {
        throwIfAborted(ac.signal);
        if (token !== runToken) return;
        batchIndex.value = i;
        const isLast = i === count;
        const isFinaleChapter = wrap && isLast;
        const instruction = wrap
          ? [
              `【收束连写】本批共 ${count} 章收束，当前第 ${i}/${count} 章。`,
              '全书进入收尾：优先兑现前文悬念、伏笔与【未收束钩子】，推进主线与人物弧光向结局靠拢。',
              '禁止新开无关大支线、新终极反派、新世界观大设定；默认男主主视角。',
              isFinaleChapter
                ? [
                    '【本批末章 = 完结章】必须收束主线与核心人物弧光，兑现前文承诺。',
                    '尽量清空未收束钩子；可写短暂余韵，不要吊胃口式断章。',
                    '不要新开大悬念/新反派/新主线；openHooks 应为空。',
                  ].join('')
                : [
                    `【收束中段 ${i}/${count}】本章重点消化若干旧钩子/悬念，但不必一次收完。`,
                    '可留少量短线过渡钩子给后续收束章接住；章末钩子要服务「继续收束」，不要另起炉灶。',
                    '禁止写成全书终局；还有后续收束章。',
                  ].join(''),
              '禁止与前文已写事实矛盾；人物动机与因果要连贯。',
            ].join('\n')
          : [
              `【连写批次】本批共 ${count} 章，当前撰写第 ${i}/${count} 章。`,
              '必须承接上一章人物状态、未解钩子、时间地点，严格跟小说大纲推进主线；默认男主主视角。',
              i < count
                ? '本章不要完结全书；章末留下清晰、可被下一章立刻接住的钩子。'
                : '本章是本批最后一章：可小收束本段弧光，但仍按大纲留续写空间（除非大纲已到终局）。',
              '禁止与前文已写事实矛盾；人物动机与因果要连贯。',
            ].join('\n');

        await runOneStream(
          {
            projectId: opts.projectId,
            model: opts.model,
            instruction,
            finale: isFinaleChapter,
          },
          token,
          ac.signal,
          wrap
            ? isFinaleChapter
              ? `收束完结 ${i}/${count}`
              : `收束 ${i}/${count}`
            : `连写 ${i}/${count}`,
        );
        done = i;
      }
      if (token !== runToken) return;
      ElMessage.success(
        wrap ? `收束连写完成 ${done} 章（末章已按完结处理）` : `已连写完成 ${done} 章`,
      );
      resetSoft();
    } catch (e: any) {
      if (token !== runToken) return;
      const aborted =
        e?.name === 'AbortError' || /cancel|abort|取消/i.test(String(e?.message || ''));
      if (aborted) {
        ElMessage.info(
          done > 0
            ? `已停止${wrap ? '收束' : '连写'}（已完成 ${done}/${count} 章，草稿保留）`
            : '已停止生成（已写出的正文仍保留在草稿里）',
        );
        lastChapterId.value = chapterId.value;
        lastCompletedAt.value = Date.now();
      } else {
        ElMessage.error(
          done > 0
            ? `${e?.message || '生成失败'}（已完成 ${done}/${count} 章）`
            : e?.message || '生成失败',
        );
      }
      resetSoft();
    }
  }

  return {
    projectId,
    chapterId,
    status,
    draft,
    running: isRunning,
    lastCompletedAt,
    lastChapterId,
    finale,
    batchTotal,
    batchIndex,
    isRunningFor,
    start,
    startBatch,
    cancel,
  };
});
