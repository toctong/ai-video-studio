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

  @Column({ type: 'varchar', length: 255, default: '' })
  name!: string;

  /** 父文件夹；空 = 根目录「我的项目」 */
  @Column({ type: 'longtext', nullable: true })
  parentId!: string;

  @Column({ type: 'integer', default: 0 })
  sortOrder!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
