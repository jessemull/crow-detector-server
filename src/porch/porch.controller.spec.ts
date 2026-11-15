import { Test, TestingModule } from '@nestjs/testing';
import { PorchController } from './porch.controller';
import { PorchClipsService } from './services/porch-clips.service';
import { InMemoryRateLimitGuard } from './guards/in-memory-rate-limit.guard';

describe('PorchController', () => {
  let controller: PorchController;
  const listClips = jest.fn();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PorchController],
      providers: [
        {
          provide: PorchClipsService,
          useValue: { listClips },
        },
      ],
    })
      .overrideGuard(InMemoryRateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(PorchController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns the clip list from the service', async () => {
    const clips = [
      {
        name: 'clip.mp4',
        recordedAt: '2026-11-14T00:00:00.000Z',
        playbackUrl: 'https://example.com/clip.mp4?sig=1',
        expiresAt: '2026-11-14T00:05:00.000Z',
      },
    ];
    listClips.mockResolvedValue(clips);

    await expect(controller.listClips()).resolves.toEqual(clips);
    expect(listClips).toHaveBeenCalledTimes(1);
  });
});
