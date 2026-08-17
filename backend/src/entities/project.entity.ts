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

  @Column({ type: 'text', default: '' })
  description!: string;

  @Column({ type: 'text', default: '' })
  styleBrief!: string;

  @Column({ type: 'simple-json', default: '{}' })
  progress!: ProjectProgress;

  /** 轻量故事状态：未收钩子、时间线速记 */
  @Column({ type: 'simple-json', default: '{}' })
  storyState!: ProjectStoryState;

  @Column({ type: 'simple-json', default: '{}' })
  modelOverrides!: Record<string, string>;

  @Column({ default: false })
  archived!: boolean;

  @Column({ type: 'text', default: '' })
  coverAssetId!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
