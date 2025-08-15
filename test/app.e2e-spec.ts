import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { Source, Status } from '../src/common/types';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Health Check', () => {
    it('/health (GET)', () => {
      return request(app.getHttpServer())
        .get('/health')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('status');
          expect(res.body).toHaveProperty('details');
        });
    });
  });

  describe('Feed Endpoints', () => {
    let feedEventId: string;

    it('/feed (POST) - should create a feed event', () => {
      const createFeedDTO = {
        imageUrl: 'https://example.com/crow-image.jpg',
        source: Source.API,
      };

      return request(app.getHttpServer())
        .post('/feed')
        .send(createFeedDTO)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('data');
          expect(res.body).toHaveProperty('message');
          expect(res.body.data).toHaveProperty('id');
          expect(res.body.data.imageUrl).toBe(createFeedDTO.imageUrl);
          expect(res.body.data.source).toBe(createFeedDTO.source);
          feedEventId = res.body.data.id;
        });
    });

    it('/feed/events (GET) - should return feed events', () => {
      return request(app.getHttpServer())
        .get('/feed/events')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          if (res.body.length > 0) {
            expect(res.body[0]).toHaveProperty('id');
            expect(res.body[0]).toHaveProperty('imageUrl');
            expect(res.body[0]).toHaveProperty('source');
          }
        });
    });

    it('/feed/events (GET) - should return feed events with limit', () => {
      return request(app.getHttpServer())
        .get('/feed/events?limit=5')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeLessThanOrEqual(5);
        });
    });

    it('/feed (PATCH) - should update a feed event', () => {
      if (!feedEventId) {
        throw new Error('Feed event ID not available from previous test');
      }

      const patchFeedDTO = {
        id: feedEventId,
        confidence: 0.95,
        croppedImageUrl: 'https://example.com/cropped.jpg',
        status: Status.ACCEPTED,
      };

      return request(app.getHttpServer())
        .patch('/feed')
        .send(patchFeedDTO)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('data');
          expect(res.body).toHaveProperty('message');
          expect(res.body.data.id).toBe(feedEventId);
          expect(res.body.data.confidence).toBe(patchFeedDTO.confidence);
          expect(res.body.data.status).toBe(patchFeedDTO.status);
        });
    });
  });

  describe('Detection Endpoints', () => {
    let detectionEventId: string;
    let feedEventId: string;

    beforeEach(async () => {
      // Create a feed event first for detection tests
      const createFeedDTO = {
        imageUrl: 'https://example.com/feed-for-detection.jpg',
        source: Source.API,
      };

      const response = await request(app.getHttpServer())
        .post('/feed')
        .send(createFeedDTO);

      feedEventId = response.body.data.id;
    });

    it('/detection (POST) - should create a detection event', async () => {
      const createDetectionDTO = {
        feedEvent: feedEventId,
        imageUrl: 'https://example.com/detection-image.jpg',
      };

      const response = await request(app.getHttpServer())
        .post('/detection')
        .send(createDetectionDTO)
        .expect(201);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('message');
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.imageUrl).toBe(createDetectionDTO.imageUrl);
      expect(response.body.data.feedEvent.id).toBe(feedEventId);
      detectionEventId = response.body.data.id;
    });

    it('/detection (GET) - should return detection events', () => {
      return request(app.getHttpServer())
        .get('/detection')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          if (res.body.length > 0) {
            expect(res.body[0]).toHaveProperty('id');
            expect(res.body[0]).toHaveProperty('imageUrl');
            expect(res.body[0]).toHaveProperty('feedEvent');
          }
        });
    });

    it('/detection (GET) - should return detection events with limit', () => {
      return request(app.getHttpServer())
        .get('/detection?limit=3')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeLessThanOrEqual(3);
        });
    });

    it('/detection (PATCH) - should update a detection event', () => {
      if (!detectionEventId) {
        throw new Error('Detection event ID not available from previous test');
      }

      const patchDetectionDTO = {
        id: detectionEventId,
        confidence: 0.98,
        crowCount: 8,
      };

      return request(app.getHttpServer())
        .patch('/detection')
        .send(patchDetectionDTO)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('data');
          expect(res.body).toHaveProperty('message');
          expect(res.body.data.id).toBe(detectionEventId);
          expect(res.body.data.confidence).toBe(patchDetectionDTO.confidence);
          expect(res.body.data.crowCount).toBe(patchDetectionDTO.crowCount);
        });
    });
  });

  describe('Validation Tests', () => {
    it('/feed (POST) - should reject invalid image URL', () => {
      const invalidFeedDTO = {
        imageUrl: 'not-a-valid-url',
        source: Source.API,
      };

      return request(app.getHttpServer())
        .post('/feed')
        .send(invalidFeedDTO)
        .expect(400);
    });

    it('/feed (POST) - should reject invalid source', () => {
      const invalidFeedDTO = {
        imageUrl: 'https://example.com/image.jpg',
        source: 'INVALID_SOURCE',
      };

      return request(app.getHttpServer())
        .post('/feed')
        .send(invalidFeedDTO)
        .expect(400);
    });

    it('/detection (POST) - should reject invalid UUID', () => {
      const invalidDetectionDTO = {
        feedEvent: 'not-a-valid-uuid',
        imageUrl: 'https://example.com/image.jpg',
      };

      return request(app.getHttpServer())
        .post('/detection')
        .send(invalidDetectionDTO)
        .expect(400);
    });
  });
});
