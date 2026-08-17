import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { WorkflowDocument } from '@ai-video-studio/shared';

@Entity('workflows')
export class Workflow {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** 空字符串 = 平台级模板/工作流 */
  @Index()
  @Column({ type: 'text', default: '' })
  projectId!: string;

  @Column({ type: 'text', default: '' })
  name!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

  /** Document v2（读时 migrate 旧 v1） */
  @Column({ type: 'simple-json', default: '{"schemaVersion":2,"nodes":[],"edges":[]}' })
  graph!: WorkflowDocument;

  @Column({ type: 'text', default: '' })
  thumbUrl!: string;

  @Column({ type: 'simple-json', default: '[]' })
  tags!: string[];

  @Column({ type: 'boolean', default: false })
  isTemplate!: boolean;

  @Column({ type: 'integer', default: 1 })
  version!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
