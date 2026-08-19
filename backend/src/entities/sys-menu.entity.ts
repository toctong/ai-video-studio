import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from './role.entity';

/** 1 目录 2 菜单 3 按钮 */
export type SysMenuType = 1 | 2 | 3;

@Entity('sys_menus')
export class SysMenu {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 64, default: '' })
  parentId!: string;

  @Column({ type: 'tinyint', default: 2 })
  type!: SysMenuType;

  @Column({ type: 'varchar', length: 128 })
  title!: string;

  @Column({ type: 'varchar', length: 128, default: '' })
  path!: string;

  @Column({ type: 'varchar', length: 64, default: '' })
  icon!: string;

  /** 前端组件标识，如 ops/cms/index */
  @Column({ type: 'varchar', length: 255, default: '' })
  component!: string;

  /** 权限标识，如 system:user:list */
  @Column({ type: 'varchar', length: 128, default: '' })
  permission!: string;

  @Column({ type: 'int', default: 0 })
  sort!: number;

  @Column({ type: 'boolean', default: false })
  hidden!: boolean;

  /** 1 启用 0 停用 */
  @Column({ type: 'varchar', length: 8, default: '1' })
  status!: string;

  @ManyToMany(() => Role, (r) => r.menus)
  roles!: Role[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
