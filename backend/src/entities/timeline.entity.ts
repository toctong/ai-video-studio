import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('timelines')
export class Timeline {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column()
  projectId!: string;

  /** 制作单级时间轴（遗留字段）；空 = 书库项目级时间轴 */
  @Index()
  @Column({ type: 'varchar', length: 64, default: '' })
  productionId!: string;

  @Column({ default: '主时间轴' })
  name!: string;

  @Column({ type: 'json', nullable: true })
  data!: {
    fps: number;
    width: number;
    height: number;
    tracks: Array<{
      id: string;
      type: 'video' | 'audio' | 'subtitle';
      name: string;
      clips: Array<{
        id: string;
        assetId: string;
        start: number;
        duration: number;
        offset?: number;
        transition?: string;
        text?: string;
      }>;
    }>;
  };

  @Column({ type: 'longtext', nullable: true })
  exportAssetId!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
