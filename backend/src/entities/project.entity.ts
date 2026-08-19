import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { ProjectProgress, ProjectStoryState } from '@ai-video-studio/shared';

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  title!: string;

  @Column({ type: 'longtext', nullable: true })
  description!: string;

  @Column({ type: 'longtext', nullable: true })
  styleBrief!: string;

  @Column({ type: 'json', nullable: true })
  progress!: ProjectProgress;

  /** 轻量故事状态：未收钩子、时间线速记 */
  @Column({ type: 'json', nullable: true })
  storyState!: ProjectStoryState;

  @Column({ type: 'json', nullable: true })
  modelOverrides!: Record<string, string>;

  @Column({ default: false })
  archived!: boolean;

  @Column({ type: 'varchar', length: 64, default: '' })
  coverAssetId!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
