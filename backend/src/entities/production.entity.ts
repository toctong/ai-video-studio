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
  @Column({ type: 'varchar', length: 64, default: '' })
  projectId!: string;

  /** 项目文件夹；空 = 根目录「我的项目」 */
  @Index()
  @Column({ type: 'varchar', length: 64, default: '' })
  folderId!: string;

  @Index()
  @Column({ type: 'varchar', length: 64, default: '' })
  chapterId!: string;

  /** 编译后的工作流画布 */
  @Index()
  @Column({ type: 'varchar', length: 64, default: '' })
  workflowId!: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  name!: string;

  @Column({ type: 'longtext', nullable: true })
  description!: string;

  /** 剧本 / 梗概正文 */
  @Column({ type: 'longtext', nullable: true })
  script!: string;

  @Column({ type: 'json', nullable: true })
  cast!: ProductionCastMember[];

  @Column({ type: 'json', nullable: true })
  scenes!: ProductionScene[];

  @Column({ type: 'json', nullable: true })
  style!: ProductionStyle;

  @Column({ type: 'json', nullable: true })
  assetIds!: string[];

  @Column({ type: 'varchar', length: 64, default: '' })
  templateId!: string;

  /** 镜头库来源 id（可选） */
  @Column({ type: 'varchar', length: 64, default: '' })
  shotLibraryId!: string;

  /** draft | ready | running | done */
  @Column({ type: 'varchar', length: 64, default: 'draft' })
  status!: string;

  @Column({ type: 'json', nullable: true })
  tags!: string[];

  @Column({ type: 'varchar', length: 255, default: '' })
  thumbUrl!: string;

  @Column({ type: 'json', nullable: true })
  meta!: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
