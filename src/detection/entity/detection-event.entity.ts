import { FeedEvent } from 'src/feed/entity/feed-event.entity';
import { ProcessingStatus } from 'src/common/types';
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

  @Column({
    nullable: true,
    precision: 3,
    scale: 2,
    type: 'decimal',
    transformer: {
      to: (value: number) => value,
      from: (value: string) => (value ? parseFloat(value) : null),
    },
  })
  confidence?: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  crowCount?: number;

  @Column({ nullable: true })
  animalCount?: number;

  @Column({ nullable: true })
  processingStatus?: ProcessingStatus;

  @Column({ nullable: true })
  processingError?: string;

  @Column({ nullable: true, type: 'text' })
  detectedAnimals?: string; // JSON string of detected animals

  @Column({ nullable: true })
  originalImageSize?: number;

  @Column({ nullable: true })
  processingDuration?: number;

  @ManyToOne(() => FeedEvent, (feedEvent) => feedEvent.detectionEvents, {
    nullable: true,
  })
  feedEvent?: FeedEvent;

  @Column()
  imageUrl: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
