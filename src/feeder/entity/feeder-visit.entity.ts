import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DetectedAnimal } from 'src/common/types';

@Entity('feeder_visit')
export class FeederVisit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  videoKey: string;

  @Column({ type: 'int' })
  animalCount: number;

  @Column({ type: 'int', default: 0 })
  crowCount: number;

  @Column({ type: 'json', nullable: true })
  detectedAnimals?: DetectedAnimal[];

  @Column({ nullable: true })
  dispenseRequestId?: string;

  @CreateDateColumn()
  createdAt: Date;
}
