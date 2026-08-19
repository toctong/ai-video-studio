import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  username!: string;

  @Column()
  passwordHash!: string;

  @Column({ default: 'admin' })
  role!: string;

  /** 展示昵称；空则前端回退到 username */
  @Column({ default: '' })
  nickname!: string;

  /** 头像 URL，如 /api/uploads/avatars/xxx.jpg */
  @Column({ default: '' })
  avatar!: string;

  /** 界面主题：light | dark（由后端持久化，前端仅 Pinia 缓存） */
  @Column({ default: 'light' })
  theme!: string;

  /** TOTP 密钥（Base32）；启用后登录需验证器动态码 */
  @Column({ default: '' })
  totpSecret!: string;

  @Column({ default: false })
  totpEnabled!: boolean;

  /**
   * 通知偏好：任务完成 / 失败 / 系统公告
   * 例：{ jobDone: true, jobFail: true, systemAnnounce: true }
   */
  @Column({ type: 'json', nullable: true })
  notifyPrefs!: {
    jobDone?: boolean;
    jobFail?: boolean;
    systemAnnounce?: boolean;
  } | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
