import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** AI 镜头库：用户生成的细案（成片 + 人物 + 场景），按概念 id 唯一 */
@Entity('shot_library_expands')
export class ShotLibraryExpand {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column()
  shotId!: string;

  @Column({ type: 'text', default: '' })
  label!: string;

  @Column({ type: 'text', default: '' })
  category!: string;

  @Column({ type: 'integer', default: 10 })
  durationSec!: number;

  @Column({ type: 'integer', default: 0 })
  castCount!: number;

  @Column({ type: 'simple-json', default: '[]' })
  castRoles!: string[];

  @Column({ type: 'text', default: '' })
  videoPrompt!: string;

  /** 四拍故事剧情摘要（起势→高潮→收束） */
  @Column({ type: 'text', default: '' })
  storyPlot!: string;

  /** 9 宫格剧情板出图提示词 */
  @Column({ type: 'text', default: '' })
  plotGridPrompt!: string;

  @Column({ type: 'text', default: '' })
  plotGridUrl!: string;

  @Column({ type: 'simple-json', default: '[]' })
  characters!: Array<{
    name: string;
    role: string;
    appearance: string;
    portraitPrompt: string;
    /** 横版工业设定板提示词 */
    sheetPrompt?: string;
  }>;

  @Column({ type: 'simple-json', default: '{}' })
  scene!: {
    name: string;
    description: string;
    imagePrompt: string;
  };

  /** 角色设定板图 url，key 为角色下标字符串 */
  @Column({ type: 'simple-json', default: '{}' })
  sheetUrls!: Record<string, string>;

  /** 可选关键道具（0～2）：巨印/卷轴/专武等需单独锁形的物件 */
  @Column({ type: 'simple-json', default: '[]' })
  props!: Array<{
    name: string;
    role: string;
    description: string;
    propPrompt: string;
  }>;

  /** 角色定妆图 url，key 为角色下标字符串 */
  @Column({ type: 'simple-json', default: '{}' })
  portraitUrls!: Record<string, string>;

  @Column({ type: 'text', default: '' })
  sceneUrl!: string;

  /** 道具参考图 url，key 为道具下标字符串 */
  @Column({ type: 'simple-json', default: '{}' })
  propUrls!: Record<string, string>;

  @Column({ type: 'text', default: '' })
  chatModel!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
