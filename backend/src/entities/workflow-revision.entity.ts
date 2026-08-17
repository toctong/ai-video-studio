import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { WorkflowDocument } from '@ai-video-studio/shared';

@Entity('workflow_revisions')
export class WorkflowRevision {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column()
  workflowId!: string;

  @Column({ type: 'integer', default: 1 })
  version!: number;

  @Column({ type: 'simple-json', default: '{"schemaVersion":2,"nodes":[],"edges":[]}' })
  document!: WorkflowDocument;

  @Column({ type: 'text', default: '' })
  note!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
