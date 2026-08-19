import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type CmsItemType =
  | 'banner'
  | 'entry'
  | 'showcase'
  | 'discover'
  | 'tool'
  | 'skill'
  | 'nav'
  | 'brand'
  | 'notice';

@Entity('cms_items')
export class CmsItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 32, default: 'banner' })
  type!: CmsItemType;

  /** 稳定业务键（可选），便于种子幂等 */
  @Index()
  @Column({ type: 'varchar', length: 64, default: '' })
  slug!: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  title!: string;

  /** 副标题 / kicker / subtitle */
  @Column({ type: 'varchar', length: 255, default: '' })
  subtitle!: string;

  @Column({ type: 'longtext', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 1024, default: '' })
  coverUrl!: string;

  @Column({ type: 'varchar', length: 1024, default: '' })
  videoUrl!: string;

  /** 点击跳转路径，如 /films?new=1 */
  @Column({ type: 'varchar', length: 512, default: '' })
  linkPath!: string;

  /**
   * 扩展字段：icon / tone / badge / badgeImg / category / mediaKind 等
   */
  @Column({ type: 'json', nullable: true })
  meta!: Record<string, unknown> | null;

  @Column({ type: 'int', default: 0 })
  sort!: number;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
