import { DataSource } from 'typeorm';
import { faker } from '@faker-js/faker';

export abstract class BaseSeeder {
  constructor(protected dataSource: DataSource) {}

  abstract seed(): Promise<void>;

  protected getRandomEnumValue<T extends Record<string, string>>(enumObj: T): T[keyof T] {
    const values = Object.values(enumObj) as T[keyof T][];
    return values[faker.number.int({ min: 0, max: values.length - 1 })];
  }

  protected getRandomNumber(min: number, max: number): number {
    return faker.number.int({ min, max });
  }

  protected getRandomFloat(min: number, max: number, precision: number = 2): number {
    return parseFloat(faker.number.float({ min, max, fractionDigits: precision }).toFixed(precision));
  }

  protected getRandomBoolean(): boolean {
    return faker.datatype.boolean();
  }

  protected getRandomDate(start: Date = new Date('2024-01-01'), end: Date = new Date()): Date {
    return faker.date.between({ from: start, to: end });
  }

  protected getRandomImageUrl(): string {
    return faker.image.url({ width: 800, height: 600 });
  }

  protected getRandomUuid(): string {
    return faker.string.uuid();
  }

  protected async clearTable(tableName: string): Promise<void> {
    await this.dataSource.query(`TRUNCATE TABLE ${tableName} CASCADE`);
  }

  protected async dropTable(tableName: string): Promise<void> {
    await this.dataSource.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
  }

  protected async resetSequence(tableName: string, columnName: string = 'id'): Promise<void> {
    await this.dataSource.query(
      `ALTER SEQUENCE ${tableName}_${columnName}_seq RESTART WITH 1`
    );
  }
} 