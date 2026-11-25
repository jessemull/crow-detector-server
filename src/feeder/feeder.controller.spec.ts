import { DispenseStatus } from './entity/dispense-request.entity';
import { FeederController } from './feeder.controller';
import { DispenseRequestService } from './services/dispense-request.service';
import { FeederPlaybackService } from './services/feeder-playback.service';
import { FeederVisitService } from './services/feeder-visit.service';

describe('FeederController', () => {
  const dispenseRequestService = {
    create: jest.fn(),
    findById: jest.fn(),
  };
  const feederVisitService = {
    listNewest: jest.fn(),
  };
  const feederPlaybackService = {
    signPlayback: jest.fn(),
  };
  const controller = new FeederController(
    dispenseRequestService as unknown as DispenseRequestService,
    feederVisitService as unknown as FeederVisitService,
    feederPlaybackService as unknown as FeederPlaybackService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the new dispense id without a clip', async () => {
    dispenseRequestService.create.mockResolvedValue({
      id: 'req-1',
      status: DispenseStatus.REQUESTED,
    });

    await expect(controller.requestDispense()).resolves.toEqual({
      id: 'req-1',
      status: DispenseStatus.REQUESTED,
    });
  });

  it('returns status only until a proof clip exists', async () => {
    dispenseRequestService.findById.mockResolvedValue({
      id: 'req-1',
      status: DispenseStatus.RECORDING,
      proofKey: null,
    });

    await expect(controller.getDispense('req-1')).resolves.toEqual({
      id: 'req-1',
      status: DispenseStatus.RECORDING,
    });
    expect(feederPlaybackService.signPlayback).not.toHaveBeenCalled();
  });

  it('signs the proof clip when the dispense is ready', async () => {
    dispenseRequestService.findById.mockResolvedValue({
      id: 'req-1',
      status: DispenseStatus.READY,
      proofKey: 'feeder/proof.mp4',
      createdAt: new Date(),
    });
    feederPlaybackService.signPlayback.mockResolvedValue({
      playbackUrl: 'https://cdn.example.com/proof.mp4',
      expiresAt: '2026-11-22T20:15:00.000Z',
    });

    await expect(controller.getDispense('req-1')).resolves.toEqual({
      id: 'req-1',
      status: DispenseStatus.READY,
      proofClipUrl: 'https://cdn.example.com/proof.mp4',
      expiresAt: '2026-11-22T20:15:00.000Z',
    });
  });

  it('does not sign a proof older than the feeder lifecycle', async () => {
    dispenseRequestService.findById.mockResolvedValue({
      id: 'req-1',
      status: DispenseStatus.READY,
      proofKey: 'feeder/proof.mp4',
      createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
    });

    await expect(controller.getDispense('req-1')).resolves.toEqual({
      id: 'req-1',
      status: DispenseStatus.READY,
    });
    expect(feederPlaybackService.signPlayback).not.toHaveBeenCalled();
  });

  it('lists signed visit clips', async () => {
    feederVisitService.listNewest.mockResolvedValue([
      {
        id: 'visit-1',
        videoKey: 'feeder/visit.mp4',
        animalCount: 1,
        crowCount: 1,
        createdAt: new Date('2026-11-22T20:10:00.000Z'),
      },
    ]);
    feederPlaybackService.signPlayback.mockResolvedValue({
      playbackUrl: 'https://cdn.example.com/visit.mp4',
      expiresAt: '2026-11-22T20:15:00.000Z',
    });

    await expect(controller.listClips()).resolves.toEqual([
      {
        id: 'visit-1',
        recordedAt: '2026-11-22T20:10:00.000Z',
        animalCount: 1,
        crowCount: 1,
        playbackUrl: 'https://cdn.example.com/visit.mp4',
        expiresAt: '2026-11-22T20:15:00.000Z',
      },
    ]);
  });
});
