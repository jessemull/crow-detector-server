import { DispenseStatus } from '../entity/dispense-request.entity';
import { FeederVisit } from '../entity/feeder-visit.entity';
import { DispenseRequestService } from './dispense-request.service';
import { FeederFeedsService } from './feeder-feeds.service';
import { FeederPlaybackService } from './feeder-playback.service';
import { FeederVisitService } from './feeder-visit.service';

describe('FeederFeedsService', () => {
  const listReadyForFeeds = jest.fn();
  const listNewest = jest.fn();
  const signPlayback = jest.fn((key: string) =>
    Promise.resolve({
      playbackUrl: `https://cdn.example.com/${key}`,
      expiresAt: '2099-01-01T00:00:00.000Z',
    }),
  );

  const service = new FeederFeedsService(
    { listReadyForFeeds } as unknown as DispenseRequestService,
    { listNewest } as unknown as FeederVisitService,
    { signPlayback } as unknown as FeederPlaybackService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('groups visits by time window and prefers dispenseRequestId', async () => {
    const newer = {
      id: 'feed-new',
      status: DispenseStatus.READY,
      proofKey: 'feeder/proof-new.mp4',
      createdAt: new Date('2026-11-22T20:00:00.000Z'),
    };
    const older = {
      id: 'feed-old',
      status: DispenseStatus.READY,
      proofKey: 'feeder/proof-old.mp4',
      createdAt: new Date('2026-11-22T18:00:00.000Z'),
    };
    listReadyForFeeds.mockResolvedValue([newer, older]);
    listNewest.mockResolvedValue([
      {
        id: 'v-linked',
        videoKey: 'feeder/linked.mp4',
        animalCount: 1,
        crowCount: 0,
        dispenseRequestId: 'feed-old',
        createdAt: new Date('2026-11-22T20:30:00.000Z'),
      },
      {
        id: 'v-new-window',
        videoKey: 'feeder/new-window.mp4',
        animalCount: 1,
        crowCount: 1,
        createdAt: new Date('2026-11-22T20:10:00.000Z'),
      },
      {
        id: 'v-old-window',
        videoKey: 'feeder/old-window.mp4',
        animalCount: 2,
        crowCount: 0,
        createdAt: new Date('2026-11-22T18:30:00.000Z'),
      },
      {
        id: 'v-ungrouped',
        videoKey: 'feeder/ungrouped.mp4',
        animalCount: 1,
        crowCount: 0,
        createdAt: new Date('2026-11-22T17:00:00.000Z'),
      },
    ] as FeederVisit[]);

    const result = await service.listFeeds();

    expect(result.feeds).toHaveLength(2);
    expect(result.feeds[0].id).toBe('feed-new');
    expect(result.feeds[0].proof?.playbackUrl).toContain('proof-new');
    expect(result.feeds[0].visits.map((v) => v.id)).toEqual(['v-new-window']);
    expect(result.feeds[1].visits.map((v) => v.id)).toEqual([
      'v-linked',
      'v-old-window',
    ]);
    expect(result.ungroupedVisits.map((v) => v.id)).toEqual(['v-ungrouped']);
  });

  it('returns empty feeds with ungrouped visits when nothing is ready', async () => {
    listReadyForFeeds.mockResolvedValue([]);
    listNewest.mockResolvedValue([
      {
        id: 'v-1',
        videoKey: 'feeder/a.mp4',
        animalCount: 1,
        crowCount: 0,
        createdAt: new Date('2026-11-22T17:00:00.000Z'),
      },
    ] as FeederVisit[]);

    const result = await service.listFeeds();

    expect(result.feeds).toEqual([]);
    expect(result.ungroupedVisits).toHaveLength(1);
  });

  it('keeps a feed with proof and no visits', async () => {
    listReadyForFeeds.mockResolvedValue([
      {
        id: 'feed-1',
        status: DispenseStatus.READY,
        proofKey: 'feeder/proof.mp4',
        createdAt: new Date('2026-11-22T20:00:00.000Z'),
      },
    ]);
    listNewest.mockResolvedValue([]);

    const result = await service.listFeeds();

    expect(result.feeds).toHaveLength(1);
    expect(result.feeds[0].visits).toEqual([]);
    expect(result.feeds[0].proof).not.toBeNull();
  });
});
