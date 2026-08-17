import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { AssetType } from '@ai-video-studio/shared';

@Entity('assets')
export class Asset {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column()
  projectId!: string;

  @Column()
  type!: AssetType;

  @Column()
  name!: string;

  @Column({ type: 'text', default: '' })
  mimeType!: string;

  @Column({ type: 'text', default: '' })
  filePath!: string;

  @Column({ type: 'text', default: '' })
  url!: string;

  @Column({ type: 'text', default: '' })
  prompt!: string;

  @Column({ type: 'simple-json', default: '{}' })
  meta!: Record<string, unknown>;

  @Column({ default: 1 })
  version!: number;

  @Column({ type: 'text', default: '' })
  parentAssetId!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
