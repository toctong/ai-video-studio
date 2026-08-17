import {
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Character } from '../../entities/character.entity';
import { AiProviderService } from '../ai/ai-provider.service';
import { AssetsService } from '../assets/assets.service';
import { ProjectsService } from '../projects/projects.service';
import { buildPortraitPrompt } from '../ai/visual-prompt';

export type ExtractedCharacter = {
  name: string;
  description?: string;
  consistencyPrompt?: string;
  role?: string;
  camp?: string;
  occupation?: string;
  morphology?: string;
  face?: string;
  body?: string;
  costume?: string;
  colors?: string;
  voiceStyle?: string;
  oocNever?: string;
  imagePromptZh?: string;
  imagePromptEn?: string;
};

const STORY_ROLE_SET = new Set(['主角', '主角团', '重要配角', '功能配角', '对手/反派', '女主角', '男主角']);

function coerceExtractedRole(
  roleRaw: string,
  occupationRaw: string,
  index: number,
): { role: string; occupation: string; camp?: string } {
  let role = String(roleRaw || '').trim();
  let occupation = String(occupationRaw || '').trim();
  if (role === '女主角' || role === '男主角') role = '主角';
  if (STORY_ROLE_SET.has(role)) {
    return { role, occupation };
  }
  // 模型常把「青云宗外门杂役」写进 role：挪到职务，站位按顺序补
  if (role && !STORY_ROLE_SET.has(role)) {
    if (!occupation) occupation = role;
    role = index === 0 ? '主角' : '重要配角';
  }
  if (!role) role = index === 0 ? '主角' : '重要配角';
  const camp = role === '对手/反派' ? '反派' : role === '主角' || role === '主角团' ? '正派' : undefined;
  return { role, occupation, camp };
}

@Injectable()
export class CharactersService {
  constructor(
    @InjectRepository(Character) private readonly characters: Repository<Character>,
    private readonly ai: AiProviderService,
    private readonly assets: AssetsService,
    @Inject(forwardRef(() => ProjectsService)) private readonly projects: ProjectsService,
  ) {}

  list(projectId: string) {
    return this.characters.find({ where: { projectId }, order: { createdAt: 'ASC' } });
  }

  async get(id: string) {
    const c = await this.characters.findOne({ where: { id } });
    if (!c) throw new NotFoundException('角色不存在');
    return c;
  }

  create(projectId: string, dto: Partial<Character>) {
    return this.characters.save(
      this.characters.create({
        projectId,
        name: dto.name || '未命名角色',
        description: dto.description || '',
        consistencyPrompt: dto.consistencyPrompt || '',
        refImageAssetId: dto.refImageAssetId || '',
        voiceAssetId: dto.voiceAssetId || '',
        voiceProvider: dto.voiceProvider || '',
        voiceId: dto.voiceId || '',
        meta: dto.meta || {},
      }),
    );
  }

  async update(id: string, dto: Partial<Character>) {
    const c = await this.get(id);
    const stale: string[] = [];
    if (dto.refImageAssetId !== undefined) {
      const prev = String(c.refImageAssetId || '').trim();
      const next = String(dto.refImageAssetId || '').trim();
      if (prev && prev !== next) stale.push(prev);
    }
    if (dto.voiceAssetId !== undefined) {
      const prev = String(c.voiceAssetId || '').trim();
      const next = String(dto.voiceAssetId || '').trim();
      if (prev && prev !== next) stale.push(prev);
    }
    Object.assign(c, dto);
    const saved = await this.characters.save(c);
    if (stale.length) await this.assets.removeMany(stale);
    return saved;
  }

  async remove(id: string) {
    const c = await this.get(id);
    await this.assets.removeMany([c.refImageAssetId, c.voiceAssetId]);
    await this.characters.delete({ id });
    return { ok: true };
  }

  /** 组装单角色定妆提示词（与出图一致，便于外贴生图） */
  async getPortraitPrompt(projectId: string, id: string) {
    const ch = await this.get(id);
    if (ch.projectId !== projectId) throw new NotFoundException('角色不属于该项目');
    const project = await this.projects.get(projectId);
    const text = buildPortraitPrompt({
      styleBrief: project.styleBrief,
      projectTitle: project.title,
      projectDescription: project.description,
      character: {
        id: ch.id,
        name: ch.name,
        description: ch.description,
        consistencyPrompt: ch.consistencyPrompt,
        meta: ch.meta || {},
        hasRefImage: !!String(ch.refImageAssetId || '').trim(),
      },
    });
    return { text, characterId: ch.id, name: ch.name };
  }

  /** 按姓名去重写入；已存在则补全空描述与设定 */
  async upsertExtracted(projectId: string, items: ExtractedCharacter[]) {
    const existing = await this.list(projectId);
    const byName = new Map(existing.map((c) => [c.name.trim(), c]));
    const created: Character[] = [];
    const updated: Character[] = [];

    for (const item of items) {
      const name = String(item.name || '').trim();
      if (!name) continue;
      const description = String(item.description || '').trim();
      const consistencyPrompt = String(item.consistencyPrompt || description || '').trim();
      const biblePatch: Record<string, unknown> = {};
      if (item.role) biblePatch.role = item.role;
      if (item.camp) biblePatch.camp = item.camp;
      if (item.occupation) biblePatch.occupation = item.occupation;
      if (item.voiceStyle) biblePatch.voiceStyle = item.voiceStyle;
      if (item.oocNever) biblePatch.oocNever = item.oocNever;
      if (item.imagePromptZh) biblePatch.imagePromptZh = item.imagePromptZh;
      if (item.imagePromptEn) biblePatch.imagePromptEn = item.imagePromptEn;
      const appearance: Record<string, string> = {};
      if (item.morphology) appearance.morphology = item.morphology;
      if (item.face) appearance.face = item.face;
      if (item.body) appearance.body = item.body;
      if (item.costume) appearance.costume = item.costume;
      if (item.colors) appearance.colors = item.colors;
      if (Object.keys(appearance).length) biblePatch.appearance = appearance;

      const found = byName.get(name);
      if (found) {
        let dirty = false;
        if (!found.description && description) {
          found.description = description;
          dirty = true;
        }
        if (!found.consistencyPrompt && consistencyPrompt) {
          found.consistencyPrompt = consistencyPrompt;
          dirty = true;
        }
        const meta = { ...(found.meta || {}) } as Record<string, unknown>;
        for (const [k, v] of Object.entries(biblePatch)) {
          if (k === 'appearance') {
            meta.appearance = { ...((meta.appearance as object) || {}), ...(v as object) };
            dirty = true;
          } else if (!meta[k] && v) {
            meta[k] = v;
            dirty = true;
          }
        }
        if (dirty) {
          found.meta = meta;
          updated.push(await this.characters.save(found));
        }
      } else {
        const row = await this.create(projectId, {
          name,
          description,
          consistencyPrompt,
          meta: { source: 'extracted', ...biblePatch },
        });
        byName.set(name, row);
        created.push(row);
      }
    }

    return {
      created: created.length,
      updated: updated.length,
      characters: [...created, ...updated],
    };
  }

  private parseCharacterJson(raw: string): ExtractedCharacter[] {
    const match = raw.match(/\[[\s\S]*\]/);
    const parsed = JSON.parse(match ? match[0] : raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x, index) => {
        const name = String(x?.name || '').trim();
        const occupationField = String(x?.occupation || x?.职务 || '').trim();
        const roleField = String(x?.role || '').trim();
        // 旧模型常把职务写在「身份」；优先当 occupation，勿直接当站位
        const identityField = String(x?.身份 || '').trim();
        const coerced = coerceExtractedRole(
          roleField || (STORY_ROLE_SET.has(identityField) ? identityField : ''),
          occupationField || (!STORY_ROLE_SET.has(identityField) ? identityField : ''),
          index,
        );
        return {
          name,
          description: String(x?.description || x?.外观 || '').trim(),
          consistencyPrompt: String(x?.consistencyPrompt || x?.consistency || '').trim(),
          role: coerced.role,
          occupation: coerced.occupation,
          camp: String(x?.camp || x?.阵营 || x?.alignment || coerced.camp || '').trim(),
          morphology: String(x?.morphology || x?.形态 || x?.appearance?.morphology || '').trim(),
          face: String(x?.face || x?.appearance?.face || '').trim(),
          body: String(x?.body || x?.appearance?.body || '').trim(),
          costume: String(x?.costume || x?.appearance?.costume || '').trim(),
          colors: String(x?.colors || x?.appearance?.colors || '').trim(),
          voiceStyle: String(x?.voiceStyle || '').trim(),
          oocNever: String(x?.oocNever || x?.绝不会做 || '').trim(),
          imagePromptZh: String(x?.imagePromptZh || '').trim(),
          imagePromptEn: String(x?.imagePromptEn || '').trim(),
        };
      })
      .filter((x) => x.name);
  }

  private async projectStyleBrief(projectId: string) {
    try {
      const p = await this.projects.get(projectId);
      return String(p.styleBrief || '').trim();
    } catch {
      return '';
    }
  }

  /** 从文本中用 LLM 抽取角色并入库 */
  async extractAndUpsert(projectId: string, text: string, model?: string) {
    const source = text.trim();
    if (!source) return { created: 0, updated: 0, characters: [] as Character[] };
    const styleBrief = await this.projectStyleBrief(projectId);

    const raw = await this.ai.chat(
      [
        {
          role: 'system',
          content: [
            '从小说大纲或正文中提取出场角色，写入人物圣经。严格输出 JSON 数组，不要其它文字，不要 Markdown 围栏。',
            '尽量提全：男主、女主（若有）、对手、关键配角、导师/盟友、功能性配角；默认 8～14 人，最多 18 人；仅忽略完全无名路人。',
            '每项字段：name, role, occupation, camp, description（2～3 句：欲望+与主线关系）,',
            'morphology（物种/形态）, face（面容发型）, body（体型年龄感）, costume（服装装备）, colors（配色标志）,',
            'voiceStyle（声线口癖）, oocNever（绝不会做，至少一句具体行为禁区）,',
            'consistencyPrompt（视觉一致关键词，逗号分隔）,',
            'imagePromptZh（可选，视觉定妆短句）, imagePromptEn（可空）。',
            'role 只能取：主角 / 主角团 / 重要配角 / 功能配角 / 对手/反派。',
            '视角约定：默认男主为主视角，必须标「主角」并放数组第一位；女主（情感线/关键搭档）标「主角团」或「重要配角」，不要把女主也标成「主角」。',
            '不要把「外门杂役/弟子」等职务写进 role；occupation 写门派职务或社会身份（如：青云宗外门杂役）；与 role 分开。',
            'camp 只能取：正派 / 反派 / 中立（主角与主角团默认正派；对手/反派默认反派；灰色人物用中立）。',
            '外形必须写清楚可画（面容发型、体型、服装、配色、标志锚点）；禁止只写性格；姓名用原文。',
            styleBrief
              ? `【项目画风参考】${styleBrief}`
              : '（未设置风格时默认可画设定插画风格）',
          ].join('\n'),
        },
        { role: 'user', content: source.slice(0, 16000) },
      ],
      model,
    );
    const items = this.parseCharacterJson(raw);
    return this.upsertExtracted(projectId, items);
  }

  /** 汇总项目剧情骨架后提取 */
  async extractFromProject(projectId: string, model?: string) {
    const parts: string[] = [];
    const scripts = await this.assets.list(projectId, 'script');
    for (const a of scripts.slice(0, 3)) {
      const content = String((a.meta as any)?.content || a.prompt || '');
      if (content.trim()) parts.push(`【${a.name}】\n${content}`);
    }
    return this.extractAndUpsert(projectId, parts.join('\n\n'), model);
  }
}
