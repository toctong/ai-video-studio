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

  @Column({ type: 'text', default: '' })
  name!: string;

  @Column({ type: 'text', default: '' })
  desc!: string;

  @Column({ type: 'text', default: '' })
  prompt!: string;

  /** image | video */
  @Column({ type: 'text', default: 'image' })
  mode!: string;

  /** FileOSS 公网封面 URL */
  @Column({ type: 'text', default: '' })
  coverUrl!: string;

  @Column({ type: 'text', default: '' })
  coverOssKey!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
