import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('user_prompts')
export class UserPrompt {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'integer' })
  userId!: number;

  @Column({ type: 'varchar', length: 255, default: '' })
  name!: string;

  @Column({ type: 'longtext', nullable: true })
  desc!: string;

  @Column({ type: 'longtext', nullable: true })
  prompt!: string;

  /** image | video */
  @Column({ type: 'varchar', length: 64, default: 'image' })
  mode!: string;

  /** FileOSS 公网封面 URL */
  @Column({ type: 'longtext', nullable: true })
  coverUrl!: string;

  @Column({ type: 'longtext', nullable: true })
  coverOssKey!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
