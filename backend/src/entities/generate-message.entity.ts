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
  @Column({ type: 'text' })
  sessionId!: string;

  @Column({ type: 'text', default: 'user' })
  role!: GenerateMessageRole;

  @Column({ type: 'text', default: 'chat' })
  kind!: GenerateMessageKind;

  @Column({ type: 'text', default: '' })
  content!: string;

  @Column({ type: 'text', default: '' })
  mediaUrl!: string;

  @Column({ type: 'text', default: '' })
  mediaOssKey!: string;

  /** 展示用比例，如 16:9 */
  @Column({ type: 'text', default: '16:9' })
  aspectRatio!: string;

  /** 生成参数快照（model/quality/count/refs…） */
  @Column({ type: 'text', default: '{}' })
  prefsJson!: string;

  @Column({ type: 'text', default: 'done' })
  status!: GenerateMessageStatus;

  @Column({ type: 'text', default: '' })
  errorMessage!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
