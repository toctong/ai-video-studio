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
  @Column({ type: 'varchar', length: 64, default: '' })
  projectId!: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  name!: string;

  @Column({ type: 'longtext', nullable: true })
  description!: string;

  /** Document v2（读时 migrate 旧 v1） */
  @Column({ type: 'json', nullable: true })
  graph!: WorkflowDocument;

  @Column({ type: 'varchar', length: 255, default: '' })
  thumbUrl!: string;

  @Column({ type: 'json', nullable: true })
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
