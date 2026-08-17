import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { JobKind, JobStatus } from '@ai-video-studio/shared';

@Entity('job_runs')
export class JobRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'text', default: '' })
  projectId!: string;

  @Column()
  kind!: JobKind;

  @Column({ default: 'queued' })
  status!: JobStatus;

  @Column({ type: 'float', default: 0 })
  progress!: number;

  @Column({ type: 'text', default: '' })
  message!: string;

  @Column({ type: 'simple-json', default: '{}' })
  payload!: Record<string, unknown>;

  @Column({ type: 'simple-json', default: '{}' })
  result!: Record<string, unknown>;

  @Column({ type: 'text', default: '' })
  error!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
