import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ProductionCastMember = {
  name: string;
  role?: string;
  appearance?: string;
  portraitPrompt?: string;
  sheetPrompt?: string;
  portraitAssetId?: string;
  sheetAssetId?: string;
};

export type ProductionScene = {
  name: string;
  description?: string;
  imagePrompt?: string;
  sceneAssetId?: string;
};

export type ProductionStyle = {
  family?: string;
  sub?: string;
  brief?: string;
  lock?: string;
};

@Entity('productions')
export class Production {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** 书库项目；空 = 平台级制作单 */
  @Index()
  @Column({ type: 'text', default: '' })
  projectId!: string;

  /** 项目文件夹；空 = 根目录「我的项目」 */
  @Index()
  @Column({ type: 'text', default: '' })
  folderId!: string;

  @Index()
  @Column({ type: 'text', default: '' })
  chapterId!: string;

  /** 编译后的工作流画布 */
  @Index()
  @Column({ type: 'text', default: '' })
  workflowId!: string;

  @Column({ type: 'text', default: '' })
  name!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

  /** 剧本 / 梗概正文 */
  @Column({ type: 'text', default: '' })
  script!: string;

  @Column({ type: 'simple-json', default: '[]' })
  cast!: ProductionCastMember[];

  @Column({ type: 'simple-json', default: '[]' })
  scenes!: ProductionScene[];

  @Column({ type: 'simple-json', default: '{}' })
  style!: ProductionStyle;

  @Column({ type: 'simple-json', default: '[]' })
  assetIds!: string[];

  @Column({ type: 'text', default: '' })
  templateId!: string;

  /** 镜头库来源 id（可选） */
  @Column({ type: 'text', default: '' })
  shotLibraryId!: string;

  /** draft | ready | running | done */
  @Column({ type: 'text', default: 'draft' })
  status!: string;

  @Column({ type: 'simple-json', default: '[]' })
  tags!: string[];

  @Column({ type: 'text', default: '' })
  thumbUrl!: string;

  @Column({ type: 'simple-json', default: '{}' })
  meta!: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
