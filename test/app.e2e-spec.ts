import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import request from 'supertest';
import { DetectionController } from '../src/detection/detection.controller';
import { DetectionEventService } from '../src/detection/services/detection-event.service';
import { FeedController } from '../src/feed/feed.controller';
import { FeedEventService } from '../src/feed/services/feed-event.service';
import { HealthController } from '../src/health/health.controller';
import { ProcessingStatus, Source, Status } from '../src/common/types';

describe('HTTP contract (e2e)', () => {
  let app: INestApplication;

  const feedEvent = {
    id: 'feed-1',
    imageUrl: 'https://example.com/crow-image.jpg',
    source: Source.API,
    status: Status.ACCEPTED,
    processingStatus: ProcessingStatus.PENDING,
    createdAt: new Date().toISOString(),
  };

  const detectionEvent = {
    id: '11111111-1111-4111-8111-111111111111',
    imageUrl: 'https://example.com/animal.jpg',
    processingStatus: ProcessingStatus.PENDING,
  };

  beforeEach(async () => {
    process.env.NODE_ENV = 'development';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [HealthController, FeedController, DetectionController],
      providers: [
        {
          provide: FeedEventService,
          useValue: {
            create: jest.fn().mockResolvedValue(feedEvent),
            find: jest.fn().mockResolvedValue([feedEvent]),
            findById: jest.fn().mockResolvedValue(feedEvent),
            getLatestFeedEventStatus: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: HealthCheckService,
          useValue: { check: jest.fn() },
        },
        {
          provide: TypeOrmHealthIndicator,
          useValue: { pingCheck: jest.fn() },
        },
        {
          provide: DetectionEventService,
          useValue: {
            create: jest.fn().mockResolvedValue(detectionEvent),
            find: jest.fn().mockResolvedValue([detectionEvent]),
            findById: jest.fn().mockResolvedValue(detectionEvent),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /health returns the liveness body', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
        expect(res.body.timestamp).toEqual(expect.any(String));
        expect(res.body.details).toBeUndefined();
      });
  });

  it('GET /feed/status/latest returns data null when empty', () => {
    return request(app.getHttpServer())
      .get('/feed/status/latest')
      .set('x-dev-mode', 'true')
      .expect(200)
      .expect((res) => {
        expect(res.body.data).toBeNull();
      });
  });

  it('POST /feed accepts imageUrl only', () => {
    return request(app.getHttpServer())
      .post('/feed')
      .set('x-dev-mode', 'true')
      .send({ imageUrl: feedEvent.imageUrl })
      .expect(201)
      .expect((res) => {
        expect(res.body.data.imageUrl).toBe(feedEvent.imageUrl);
      });
  });

  it('POST /feed rejects a source field', () => {
    return request(app.getHttpServer())
      .post('/feed')
      .set('x-dev-mode', 'true')
      .send({ imageUrl: feedEvent.imageUrl, source: Source.API })
      .expect(400);
  });

  it('GET /feed/events requires the dev bypass and returns the list', () => {
    return request(app.getHttpServer())
      .get('/feed/events')
      .set('x-dev-mode', 'true')
      .expect(200)
      .expect((res) => {
        expect(res.body[0].id).toBe(feedEvent.id);
      });
  });

  it('POST /detection accepts imageUrl only', () => {
    return request(app.getHttpServer())
      .post('/detection')
      .set('x-dev-mode', 'true')
      .send({ imageUrl: detectionEvent.imageUrl })
      .expect(201)
      .expect((res) => {
        expect(res.body.data.id).toBe(detectionEvent.id);
        expect(res.body.message).toEqual(expect.any(String));
      });
  });

  it('GET /detection/:id returns data and message', () => {
    return request(app.getHttpServer())
      .get(`/detection/${detectionEvent.id}`)
      .set('x-dev-mode', 'true')
      .expect(200)
      .expect((res) => {
        expect(res.body.data.id).toBe(detectionEvent.id);
        expect(res.body.message).toEqual(expect.any(String));
      });
  });
});
