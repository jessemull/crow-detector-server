import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Source, ProcessingStatus, Status } from 'src/common/types';
import { DetectionEvent } from 'src/detection/entity/detection-event.entity';

@Entity('feed_event')
export class FeedEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    nullable: true,
    type: 'decimal',
    precision: 3,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => (value ? parseFloat(value) : null),
    },
  })
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

  @Column({ nullable: true })
  s3Bucket?: string;

  @Column({ nullable: true })
  s3Key?: string;

  @Column({
    enum: ProcessingStatus,
    default: ProcessingStatus.PENDING,
    type: 'enum',
  })
  processingStatus: ProcessingStatus;

  @Column({ nullable: true })
  processingError?: string;

  @Column({ nullable: true })
  moderationLabels?: string;

  @Column({ nullable: true })
  faceDetected: boolean;

  @Column({ nullable: true })
  faceBoundingBox?: string;

  @Column({ nullable: true })
  originalImageSize?: number;

  @Column({ nullable: true })
  processedImageSize?: number;

  @Column({ nullable: true })
  processingDuration?: number; // Milliseconds
}
