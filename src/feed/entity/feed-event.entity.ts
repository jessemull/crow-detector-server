import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Source } from 'src/common/types';
import { DetectionEvent } from 'src/detection/entity/detection-event.entity';

enum Status {
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}

@Entity('feed_event')
export class FeedEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true, type: 'decimal', precision: 3, scale: 2 })
  confidence?: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  croppedImageUrl?: string;

  @OneToMany(
    () => DetectionEvent,
    (detectionEvent) => detectionEvent.feedEvent,
    {
      cascade: true,
    },
  )
  detectionEvents: DetectionEvent[];

  @Column()
  imageUrl: string;

  @Column({ nullable: true })
  isAppropriate: boolean;

  @Column({
    default: Source.BUTTON,
    enum: Source,
    type: 'enum',
  })
  source: Source;

  @Column({
    enum: Status,
    nullable: true,
    type: 'enum',
  })
  status?: Status;

  @UpdateDateColumn()
  updatedAt: Date;
}
