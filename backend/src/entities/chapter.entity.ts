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
  @Column({ type: 'simple-json', default: '{}' })
  chapterCard!: ChapterCard;

  @Column({ type: 'text', default: '' })
  synopsis!: string;

  @Column({ type: 'text', default: '' })
  novelBody!: string;

  /** 给下一章用的承接摘要 */
  @Column({ type: 'text', default: '' })
  continuitySummary!: string;

  /** draft | generated | edited */
  @Column({ default: 'draft' })
  status!: string;

  @Column({ type: 'simple-json', default: '{}' })
  meta!: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
