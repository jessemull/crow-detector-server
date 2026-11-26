import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum DispenseStatus {
  REQUESTED = 'requested',
  RECORDING = 'recording',
  READY = 'ready',
  FAILED = 'failed',
}

@Entity('dispense_request')
export class DispenseRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    enum: DispenseStatus,
    type: 'enum',
    default: DispenseStatus.REQUESTED,
  })
  status!: DispenseStatus;

  @Column({ nullable: true })
  proofKey?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
