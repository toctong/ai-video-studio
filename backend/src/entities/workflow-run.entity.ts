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
  @Column({ type: 'text', default: '' })
  projectId!: string;

  @Column({ type: 'text', default: '' })
  jobRunId!: string;

  @Column({ type: 'text', default: 'queued' })
  status!: WorkflowRunStatus;

  /** 与 JobRun 进度同源，供 SSE / 轮询直接读取 */
  @Column({ type: 'real', default: 0 })
  progress!: number;

  @Column({ type: 'text', default: '' })
  message!: string;

  /** 编辑态快照（Document） */
  @Column({ type: 'simple-json', default: '{"schemaVersion":2,"nodes":[],"edges":[]}' })
  graphSnapshot!: WorkflowDocument;

  /** 执行态 Prompt */
  @Column({ type: 'simple-json', default: '{"schemaVersion":1,"nodes":{}}' })
  promptSnapshot!: ExecutionPrompt;

  @Column({ type: 'simple-json', default: '{}' })
  nodeStates!: Record<string, WorkflowNodeState>;

  @Column({ type: 'simple-json', default: '{}' })
  inputs!: Record<string, unknown>;

  @Column({ type: 'simple-json', default: '{}' })
  result!: Record<string, unknown>;

  @Column({ type: 'text', default: '' })
  error!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
