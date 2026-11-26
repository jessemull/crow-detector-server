import { ForbiddenException } from '@nestjs/common';
import { ClaudeService } from '../detection/services/claude.service';
import { DispenseStatus } from './entity/dispense-request.entity';
import { FeederHostController } from './feeder-host.controller';
import { DispenseRequestService } from './services/dispense-request.service';
import { FeederVisitService } from './services/feeder-visit.service';

describe('FeederHostController', () => {
  const dispenseRequestService = {
    claimNext: jest.fn(),
    complete: jest.fn(),
  };
  const feederVisitService = {
    create: jest.fn(),
  };
  const claudeService = {
    analyzeAnimalPhoto: jest.fn(),
  };
  const controller = new FeederHostController(
    dispenseRequestService as unknown as DispenseRequestService,
    feederVisitService as unknown as FeederVisitService,
    claudeService as unknown as ClaudeService,
  );
  const feeder = { deviceId: 'pi-feeder' } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects hosts that are not the feeder', async () => {
    await expect(
      controller.claimPending({ deviceId: 'pi-porch' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(dispenseRequestService.claimNext).not.toHaveBeenCalled();
  });

  it('claims the next dispense for the feeder host', async () => {
    dispenseRequestService.claimNext.mockResolvedValue({ id: 'req-1' });
    await expect(controller.claimPending(feeder)).resolves.toEqual({
      request: { id: 'req-1' },
    });
  });

  it('completes a dispense', async () => {
    dispenseRequestService.complete.mockResolvedValue({
      id: 'req-1',
      status: DispenseStatus.READY,
    });

    await expect(
      controller.completeDispense(
        'req-1',
        { status: DispenseStatus.READY, proofKey: 'feeder/proof.mp4' },
        feeder,
      ),
    ).resolves.toEqual({ id: 'req-1', status: DispenseStatus.READY });
  });

  it('rejects an empty classification frame', async () => {
    await expect(
      controller.classify({ imageBase64: '', mediaType: 'image/jpeg' }, feeder),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(claudeService.analyzeAnimalPhoto).not.toHaveBeenCalled();
  });

  it('rejects a frame that is too large', async () => {
    const image = Buffer.alloc(2_000_001);
    await expect(
      controller.classify(
        { imageBase64: image.toString('base64'), mediaType: 'image/jpeg' },
        feeder,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(claudeService.analyzeAnimalPhoto).not.toHaveBeenCalled();
  });

  it('classifies a frame for dev-mode', async () => {
    claudeService.analyzeAnimalPhoto.mockResolvedValue({ hasAnimals: true });

    await expect(
      controller.classify(
        {
          imageBase64: Buffer.from('crow').toString('base64'),
          mediaType: 'image/jpeg',
        },
        { deviceId: 'dev-mode' } as any,
      ),
    ).resolves.toEqual({ hasAnimals: true });
  });

  it('records a visit', async () => {
    feederVisitService.create.mockResolvedValue({ id: 'visit-1' });

    await expect(
      controller.createVisit(
        { videoKey: 'feeder/visit.mp4', animalCount: 1 },
        feeder,
      ),
    ).resolves.toEqual({ id: 'visit-1' });
  });
});
