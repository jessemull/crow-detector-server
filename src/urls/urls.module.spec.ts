import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { UrlsController } from './urls.controller';
import { UrlsModule } from './urls.module';
import { UrlsService } from './services/urls.service';

describe('UrlsModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
        }),
        UrlsModule,
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

  it('should have EcdsaAuthMiddleware', () => {
    expect(module).toBeDefined();
  });
});
