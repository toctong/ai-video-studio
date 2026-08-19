import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SysMenu } from './sys-menu.entity';

@Entity('sys_roles')
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  name!: string;

  /** 角色编码，写入 JWT user.role，如 admin / ops / user */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Column({ type: 'int', default: 0 })
  sort!: number;

  /** 1 启用 0 停用 */
  @Column({ type: 'varchar', length: 8, default: '1' })
  status!: string;

  @Column({ type: 'varchar', length: 512, default: '' })
  description!: string;

  @ManyToMany(() => SysMenu, (m) => m.roles, { cascade: false })
  @JoinTable({
    name: 'sys_role_menus',
    joinColumn: { name: 'roleId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'menuId', referencedColumnName: 'id' },
  })
  menus!: SysMenu[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
