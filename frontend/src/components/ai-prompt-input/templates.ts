import type { AiPromptTemplate } from './types';
import { legacyTemplateToDoc } from './serialize';

type LegacyTpl = {
  id: string;
  label: string;
  description?: string;
  legacyNodes: any[];
};

function finalize(list: LegacyTpl[]): AiPromptTemplate[] {
  return list.map(({ legacyNodes, ...rest }) => ({
    ...rest,
    content: legacyTemplateToDoc(legacyNodes),
  }));
}

/** 小说灵感默认模板 */
export const SCRIPT_TEMPLATES: AiPromptTemplate[] = finalize([
  {
    id: 'script-basic',
    label: '小说大纲',
    description: '题材 + 男主 + 冲突',
    legacyNodes: [
      {
        type: 'paragraph',
        children: [
          { text: '题材：' },
          {
            type: 'select-tag',
            children: [{ text: '' }],
            value: '都市重生',
            options: [
              { label: '都市重生', value: '都市重生' },
              { label: '玄幻修仙', value: '玄幻修仙' },
              { label: '搞笑修仙', value: '搞笑修仙' },
              { label: '搞笑都市', value: '搞笑都市' },
              { label: '沙雕搞笑', value: '沙雕搞笑' },
              { label: '霸道甜宠', value: '霸道甜宠' },
              { label: '腹黑权谋', value: '腹黑权谋' },
              { label: '系统流', value: '系统流' },
              { label: '穿越重生', value: '穿越重生' },
              { label: '末世求生', value: '末世求生' },
              { label: '变异文', value: '变异文' },
              { label: '诸天无限', value: '诸天无限' },
              { label: '种田基建', value: '种田基建' },
              { label: '规则怪谈', value: '规则怪谈' },
              { label: '都市战神', value: '都市战神' },
              { label: '爽文打脸', value: '爽文打脸' },
              { label: '电竞文娱', value: '电竞文娱' },
              { label: '校园青春', value: '校园青春' },
              { label: '古风权谋', value: '古风权谋' },
              { label: '历史穿越', value: '历史穿越' },
              { label: '科幻赛博', value: '科幻赛博' },
              { label: '武侠江湖', value: '武侠江湖' },
              { label: '病娇暗恋', value: '病娇暗恋' },
              { label: '宫斗宅斗', value: '宫斗宅斗' },
              { label: '娱乐圈', value: '娱乐圈' },
              { label: '无限流', value: '无限流' },
              { label: '甜宠恋爱', value: '甜宠恋爱' },
              { label: '悬疑推理', value: '悬疑推理' },
            ],
          },
          { text: '。男主是' },
          { type: 'input-tag', children: [{ text: '' }], label: '[男主设定]' },
          { text: '，核心冲突是' },
          { type: 'input-tag', children: [{ text: '' }], label: '[核心冲突]' },
          { text: '。默认男主主视角；女主可作情感线或重要配。' },
        ],
      },
    ],
  },
  {
    id: 'script-episode',
    label: '开章钩子',
    description: '开篇抓人到章末悬念',
    legacyNodes: [
      {
        type: 'paragraph',
        children: [
          { text: '开篇钩子：' },
          { type: 'input-tag', children: [{ text: '' }], label: '[开场情境]' },
          { text: '；中段反转：' },
          { type: 'input-tag', children: [{ text: '' }], label: '[反转点]' },
          { text: '；章末悬念：' },
          { type: 'input-tag', children: [{ text: '' }], label: '[悬念]' },
          { text: '。' },
        ],
      },
    ],
  },
  {
    id: 'script-cast',
    label: '人物关系',
    description: '男主 · 女主 · 对手',
    legacyNodes: [
      {
        type: 'paragraph',
        children: [
          { text: '男主（主视角）：' },
          { type: 'input-tag', children: [{ text: '' }], label: '[男主]' },
          { text: '；女主/搭档：' },
          { type: 'input-tag', children: [{ text: '' }], label: '[女主或搭档]' },
          { text: '；对手：' },
          { type: 'input-tag', children: [{ text: '' }], label: '[对手]' },
          { text: '。关系张力：' },
          { type: 'input-tag', children: [{ text: '' }], label: '[张力]' },
          { text: '。' },
        ],
      },
    ],
  },
  {
    id: 'script-arc',
    label: '三幕骨架',
    description: '建置 · 对抗 · 收束',
    legacyNodes: [
      {
        type: 'paragraph',
        children: [
          {
            text: '请按网文三幕写大纲骨架：①建置（男主欲望与代价）②对抗升级（对手与女主线交织）③高潮与收束（章末可留钩子）。主题：',
          },
          { type: 'input-tag', children: [{ text: '' }], label: '[主题]' },
          { text: '。' },
        ],
      },
    ],
  },
]);

/** 画面风格模板（封面 / 定妆参考） */
export const STYLE_TEMPLATES: AiPromptTemplate[] = finalize([
  {
    id: 'style-anime',
    label: '插画风',
    description: '赛璐璐 + 光影',
    legacyNodes: [
      {
        type: 'paragraph',
        children: [
          { text: '画面风格：' },
          {
            type: 'select-tag',
            children: [{ text: '' }],
            value: '赛璐璐日漫',
            options: [
              { label: '赛璐璐日漫', value: '赛璐璐日漫' },
              { label: '厚涂插画', value: '厚涂插画' },
              { label: '水彩手绘', value: '水彩手绘' },
              { label: '国风工笔', value: '国风工笔' },
              { label: '韩漫清新', value: '韩漫清新' },
              { label: '赛博朋克', value: '赛博朋克' },
              { label: '写实电影', value: '写实电影' },
            ],
          },
          { text: '，色调偏' },
          { type: 'input-tag', children: [{ text: '暖色黄昏' }], label: '[色调]' },
          { text: '，细节要求：' },
          { type: 'input-tag', children: [{ text: '' }], label: '[细节]' },
          { text: '。适合小说封面与角色定妆。' },
        ],
      },
    ],
  },
  {
    id: 'style-cover',
    label: '封面构图',
    description: '主体 + 氛围',
    legacyNodes: [
      {
        type: 'paragraph',
        children: [
          { text: '封面主体：' },
          { type: 'input-tag', children: [{ text: '' }], label: '[男主或关键意象]' },
          { text: '，构图：' },
          {
            type: 'select-tag',
            children: [{ text: '' }],
            value: '半身特写',
            options: [
              { label: '半身特写', value: '半身特写' },
              { label: '全身站立', value: '全身站立' },
              { label: '远景氛围', value: '远景氛围' },
              { label: '对峙双人', value: '对峙双人' },
            ],
          },
          { text: '，氛围：' },
          { type: 'input-tag', children: [{ text: '' }], label: '[氛围]' },
          { text: '。' },
        ],
      },
    ],
  },
]);

/** 角色外形模板 */
export const CHARACTER_TEMPLATES: AiPromptTemplate[] = finalize([
  {
    id: 'char-basic',
    label: '角色外形',
    description: '年龄外貌服装',
    legacyNodes: [
      {
        type: 'paragraph',
        children: [
          { text: '' },
          { type: 'input-tag', children: [{ text: '' }], label: '[年龄气质]' },
          { text: '，发型发色' },
          { type: 'input-tag', children: [{ text: '' }], label: '[发型发色]' },
          { text: '，服装' },
          { type: 'input-tag', children: [{ text: '' }], label: '[服装]' },
          { text: '。' },
        ],
      },
    ],
  },
]);

/** @deprecated 配乐能力已下线，保留空表以免旧引用报错 */
export const MUSIC_TEMPLATES: AiPromptTemplate[] = [];
