import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type DiscoverPostKind = 'workflow' | 'skill' | 'template' | 'production';

@Entity('discover_posts')
export class DiscoverPost {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 64, default: 'workflow' })
  kind!: DiscoverPostKind;

  @Column({ type: 'varchar', length: 255, default: '' })
  title!: string;

  @Column({ type: 'longtext', nullable: true })
  description!: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  thumbUrl!: string;

  /** 导出包正文（工作流图 / 技能包 / 制作单 JSON 等） */
  @Column({ type: 'json', nullable: true })
  payload!: Record<string, unknown>;

  /** 来源实体 id（workflowId / productionId / skillId） */
  @Index()
  @Column({ type: 'varchar', length: 64, default: '' })
  sourceId!: string;

  @Index()
  @Column({ type: 'integer', default: 0 })
  authorUserId!: number;

  @Column({ type: 'varchar', length: 255, default: '' })
  authorName!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64, default: '' })
  shareToken!: string;

  @Column({ type: 'integer', default: 0 })
  likeCount!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ type: 'datetime', nullable: true })
  publishedAt!: Date | null;
}
