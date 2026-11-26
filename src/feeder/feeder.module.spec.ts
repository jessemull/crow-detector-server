import { InMemoryRateLimitGuard } from '../porch/guards/in-memory-rate-limit.guard';
import { PorchModule } from '../porch/porch.module';
import { FeederModule } from './feeder.module';

describe('FeederModule', () => {
  it('is defined', () => {
    expect(FeederModule).toBeDefined();
  });

  it('shares the porch rate-limit guard', () => {
    const imports = Reflect.getMetadata('imports', FeederModule) as unknown[];
    const providers = Reflect.getMetadata(
      'providers',
      FeederModule,
    ) as unknown[];

    expect(imports).toContain(PorchModule);
    expect(providers).not.toContain(InMemoryRateLimitGuard);
  });
});
