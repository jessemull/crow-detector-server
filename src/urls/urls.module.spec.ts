import { Test, TestingModule } from '@nestjs/testing';
import { UrlsController } from './urls.controller';
import { UrlsService } from './services/urls.service';
import { ConfigService } from '@nestjs/config';

describe('UrlsModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        UrlsService,
        UrlsController,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'awsRegion') return 'us-west-2';
              if (key === 's3BucketName') return 'test-bucket';
              return undefined;
            }),
          },
        },
      ],
    }).compile();
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should have UrlsController', () => {
    const controller = module.get<UrlsController>(UrlsController);
    expect(controller).toBeDefined();
  });

  it('should have UrlsService', () => {
    const service = module.get<UrlsService>(UrlsService);
    expect(service).toBeDefined();
  });
});
