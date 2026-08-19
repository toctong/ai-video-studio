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
  @Column({ type: 'varchar', length: 64, default: '' })
  projectId!: string;

  @Column()
  kind!: JobKind;

  @Column({ default: 'queued' })
  status!: JobStatus;

  @Column({ type: 'float', default: 0 })
  progress!: number;

  @Column({ type: 'longtext', nullable: true })
  message!: string;

  @Column({ type: 'json', nullable: true })
  payload!: Record<string, unknown>;

  @Column({ type: 'json', nullable: true })
  result!: Record<string, unknown>;

  @Column({ type: 'longtext', nullable: true })
  error!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
