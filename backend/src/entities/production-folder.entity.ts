import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('production_folders')
export class ProductionFolder {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', default: '' })
  name!: string;

  /** 父文件夹；空 = 根目录「我的项目」 */
  @Column({ type: 'text', default: '' })
  parentId!: string;

  @Column({ type: 'integer', default: 0 })
  sortOrder!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
