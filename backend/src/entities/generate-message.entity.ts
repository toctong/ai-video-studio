import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** chat | image | video */
export type GenerateMessageKind = 'chat' | 'image' | 'video';
/** user | assistant */
export type GenerateMessageRole = 'user' | 'assistant';
/** pending | streaming | done | error */
export type GenerateMessageStatus = 'pending' | 'streaming' | 'done' | 'error';

@Entity('generate_messages')
export class GenerateMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  sessionId!: string;

  @Column({ type: 'varchar', length: 64, default: 'user' })
  role!: GenerateMessageRole;

  @Column({ type: 'varchar', length: 64, default: 'chat' })
  kind!: GenerateMessageKind;

  @Column({ type: 'longtext', nullable: true })
  content!: string;

  @Column({ type: 'longtext', nullable: true })
  mediaUrl!: string;

  @Column({ type: 'longtext', nullable: true })
  mediaOssKey!: string;

  /** 展示用比例，如 16:9 */
  @Column({ type: 'varchar', length: 64, default: '16:9' })
  aspectRatio!: string;

  /** 生成参数快照（model/quality/count/refs…） */
  @Column({ type: 'longtext', nullable: true })
  prefsJson!: string;

  @Column({ type: 'varchar', length: 64, default: 'done' })
  status!: GenerateMessageStatus;

  @Column({ type: 'longtext', nullable: true })
  errorMessage!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
