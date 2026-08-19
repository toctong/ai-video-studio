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

  @Column({ type: 'longtext', nullable: true })
  description!: string;

  @Column({ type: 'longtext', nullable: true })
  consistencyPrompt!: string;

  @Column({ type: 'longtext', nullable: true })
  refImageAssetId!: string;

  @Column({ type: 'longtext', nullable: true })
  voiceAssetId!: string;

  @Column({ type: 'longtext', nullable: true })
  voiceProvider!: string;

  @Column({ type: 'longtext', nullable: true })
  voiceId!: string;

  @Column({ type: 'json', nullable: true })
  meta!: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
