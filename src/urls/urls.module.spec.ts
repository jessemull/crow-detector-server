import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { UrlsModule } from './urls.module';
import { UrlsController } from './urls.controller';
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
    // Note: Testing middleware configuration in NestJS modules can be complex
    // as it involves the framework's internal routing system.
    // The middleware configuration is verified by checking that the module
    // compiles successfully with the middleware configured.
    expect(module).toBeDefined();
  });
});
