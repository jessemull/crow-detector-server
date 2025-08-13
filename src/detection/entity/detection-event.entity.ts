import { FeedEvent } from 'src/feed/entity/feed-event.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('detection_event')
export class DetectionEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true, type: 'decimal', precision: 3, scale: 2 })
  confidence?: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  crowCount?: number;

  @ManyToOne(() => FeedEvent, (feedEvent) => feedEvent.detectionEvents)
  feedEvent: FeedEvent;

  @Column()
  imageUrl: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
