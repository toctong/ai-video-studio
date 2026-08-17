import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('characters')
export class Character {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column()
  projectId!: string;

  @Column()
  name!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

  @Column({ type: 'text', default: '' })
  consistencyPrompt!: string;

  @Column({ type: 'text', default: '' })
  refImageAssetId!: string;

  @Column({ type: 'text', default: '' })
  voiceAssetId!: string;

  @Column({ type: 'text', default: '' })
  voiceProvider!: string;

  @Column({ type: 'text', default: '' })
  voiceId!: string;

  @Column({ type: 'simple-json', default: '{}' })
  meta!: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
