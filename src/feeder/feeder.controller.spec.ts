import { DispenseStatus } from './entity/dispense-request.entity';
import { FeederController } from './feeder.controller';
import { DispenseRequestService } from './services/dispense-request.service';
import { FeederFeedsService } from './services/feeder-feeds.service';
import { FeederPlaybackService } from './services/feeder-playback.service';
import { FeederVisitService } from './services/feeder-visit.service';

describe('FeederController', () => {
  const dispenseRequestService = {
    create: jest.fn(),
    findById: jest.fn(),
    getPublicStatus: jest.fn(),
  };
  const feederVisitService = {
    listNewest: jest.fn(),
  };
  const feederPlaybackService = {
    signPlayback: jest.fn(),
  };
  const feederFeedsService = {
    listFeeds: jest.fn(),
  };
  const controller = new FeederController(
    dispenseRequestService as unknown as DispenseRequestService,
    feederVisitService as unknown as FeederVisitService,
    feederPlaybackService as unknown as FeederPlaybackService,
    feederFeedsService as unknown as FeederFeedsService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns public feeder status', async () => {
    dispenseRequestService.getPublicStatus.mockResolvedValue({
      canFeed: true,
      cooldownEndsAt: null,
      lastFeedAt: null,
      lastFeedId: null,
    });

    await expect(controller.getStatus()).resolves.toEqual({
      canFeed: true,
      cooldownEndsAt: null,
      lastFeedAt: null,
      lastFeedId: null,
    });
  });

  it('returns the new dispense id with cooldownEndsAt', async () => {
    dispenseRequestService.create.mockResolvedValue({
      id: 'req-1',
      status: DispenseStatus.REQUESTED,
      createdAt: new Date('2026-11-22T20:00:00.000Z'),
    });

    await expect(controller.requestDispense()).resolves.toEqual({
      id: 'req-1',
      status: DispenseStatus.REQUESTED,
      cooldownEndsAt: '2026-11-22T20:10:00.000Z',
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

  it('lists feed sections', async () => {
    feederFeedsService.listFeeds.mockResolvedValue({
      feeds: [],
      ungroupedVisits: [],
    });

    await expect(controller.listFeeds()).resolves.toEqual({
      feeds: [],
      ungroupedVisits: [],
    });
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
