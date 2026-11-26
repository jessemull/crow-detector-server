import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DetectedAnimal } from 'src/common/types';

@Entity('feeder_visit')
@Index('feeder_visit_created_at_idx', ['createdAt'])
export class FeederVisit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  videoKey!: string;

  @Column({ type: 'int' })
  animalCount!: number;

  @Column({ type: 'int', default: 0 })
  crowCount!: number;

  @Column({ type: 'json', nullable: true })
  detectedAnimals?: DetectedAnimal[];

  @Column({ nullable: true })
  dispenseRequestId?: string;

  @CreateDateColumn()
  createdAt!: Date;
}
