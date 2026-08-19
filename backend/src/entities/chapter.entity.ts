import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { ChapterCard } from '@ai-video-studio/shared';

@Entity('chapters')
export class Chapter {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column()
  projectId!: string;

  @Column({ type: 'int', default: 0 })
  orderIndex!: number;

  @Column({ default: '' })
  title!: string;

  /** 写正文前的章节卡（目标/出场/事件/钩子） */
  @Column({ type: 'json', nullable: true })
  chapterCard!: ChapterCard;

  @Column({ type: 'longtext', nullable: true })
  synopsis!: string;

  @Column({ type: 'longtext', nullable: true })
  novelBody!: string;

  /** 给下一章用的承接摘要 */
  @Column({ type: 'longtext', nullable: true })
  continuitySummary!: string;

  /** draft | generated | edited */
  @Column({ default: 'draft' })
  status!: string;

  @Column({ type: 'json', nullable: true })
  meta!: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
