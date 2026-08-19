import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  ExecutionPrompt,
  WorkflowDocument,
  WorkflowNodeState,
  WorkflowRunStatus,
} from '@ai-video-studio/shared';

@Entity('workflow_runs')
export class WorkflowRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column()
  workflowId!: string;

  @Index()
  @Column({ type: 'varchar', length: 64, default: '' })
  projectId!: string;

  @Column({ type: 'longtext', nullable: true })
  jobRunId!: string;

  @Column({ type: 'varchar', length: 64, default: 'queued' })
  status!: WorkflowRunStatus;

  /** 与 JobRun 进度同源，供 SSE / 轮询直接读取 */
  @Column({ type: 'float', default: 0 })
  progress!: number;

  @Column({ type: 'longtext', nullable: true })
  message!: string;

  /** 编辑态快照（Document） */
  @Column({ type: 'json', nullable: true })
  graphSnapshot!: WorkflowDocument;

  /** 执行态 Prompt */
  @Column({ type: 'json', nullable: true })
  promptSnapshot!: ExecutionPrompt;

  @Column({ type: 'json', nullable: true })
  nodeStates!: Record<string, WorkflowNodeState>;

  @Column({ type: 'json', nullable: true })
  inputs!: Record<string, unknown>;

  @Column({ type: 'json', nullable: true })
  result!: Record<string, unknown>;

  @Column({ type: 'longtext', nullable: true })
  error!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
