import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('app_settings')
export class AppSetting {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  key!: string;

  @Column({ type: 'longtext', nullable: true })
  value!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
