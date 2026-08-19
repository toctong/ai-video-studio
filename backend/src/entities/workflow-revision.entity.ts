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

  @Column({ type: 'json', nullable: true })
  document!: WorkflowDocument;

  @Column({ type: 'longtext', nullable: true })
  note!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
