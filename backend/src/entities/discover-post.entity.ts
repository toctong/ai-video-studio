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
  @Column({ type: 'text', default: 'workflow' })
  kind!: DiscoverPostKind;

  @Column({ type: 'text', default: '' })
  title!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

  @Column({ type: 'text', default: '' })
  thumbUrl!: string;

  /** 导出包正文（工作流图 / 技能包 / 制作单 JSON 等） */
  @Column({ type: 'simple-json', default: '{}' })
  payload!: Record<string, unknown>;

  /** 来源实体 id（workflowId / productionId / skillId） */
  @Index()
  @Column({ type: 'text', default: '' })
  sourceId!: string;

  @Index()
  @Column({ type: 'integer', default: 0 })
  authorUserId!: number;

  @Column({ type: 'text', default: '' })
  authorName!: string;

  @Index({ unique: true })
  @Column({ type: 'text', default: '' })
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
