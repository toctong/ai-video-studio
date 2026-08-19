import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('sys_depts')
export class Dept {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 64, default: '' })
  parentId!: string;

  @Column({ type: 'varchar', length: 128 })
  name!: string;

  @Column({ type: 'int', default: 0 })
  sort!: number;

  /** 1 启用 0 停用 */
  @Column({ type: 'varchar', length: 8, default: '1' })
  status!: string;

  @Column({ type: 'varchar', length: 512, default: '' })
  description!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
