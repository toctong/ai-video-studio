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

  @Column({ type: 'varchar', length: 255, default: '' })
  mimeType!: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  filePath!: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  url!: string;

  @Column({ type: 'longtext', nullable: true })
  prompt!: string;

  @Column({ type: 'json', nullable: true })
  meta!: Record<string, unknown>;

  @Column({ default: 1 })
  version!: number;

  @Column({ type: 'varchar', length: 64, default: '' })
  parentAssetId!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
