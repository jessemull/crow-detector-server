import { Injectable } from '@nestjs/common';
import { DispenseRequest } from '../entity/dispense-request.entity';
import { FeederVisit } from '../entity/feeder-visit.entity';
import { DispenseRequestService } from './dispense-request.service';
import { FeederPlaybackService } from './feeder-playback.service';
import { FeederVisitService } from './feeder-visit.service';

export type FeederClipDto = {
  id: string;
  recordedAt: string;
  animalCount: number;
  crowCount: number;
  playbackUrl: string;
  expiresAt: string;
};

export type FeederFeedDto = {
  id: string;
  fedAt: string;
  proof: { playbackUrl: string; expiresAt: string } | null;
  visits: FeederClipDto[];
};

export type FeederFeedsResponse = {
  feeds: FeederFeedDto[];
  ungroupedVisits: FeederClipDto[];
};

@Injectable()
export class FeederFeedsService {
  constructor(
    private readonly dispenseRequestService: DispenseRequestService,
    private readonly feederVisitService: FeederVisitService,
    private readonly feederPlaybackService: FeederPlaybackService,
  ) {}

  async listFeeds(now = Date.now()): Promise<FeederFeedsResponse> {
    const [readyFeeds, visits] = await Promise.all([
      this.dispenseRequestService.listReadyForFeeds(now),
      this.feederVisitService.listNewest(),
    ]);

    const feedsNewestFirst = [...readyFeeds].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );

    const assigned = new Set<string>();
    const feedVisitMap = new Map<string, FeederVisit[]>();
    for (const feed of feedsNewestFirst) {
      feedVisitMap.set(feed.id, []);
    }

    for (const visit of visits) {
      if (
        visit.dispenseRequestId &&
        feedVisitMap.has(visit.dispenseRequestId)
      ) {
        feedVisitMap.get(visit.dispenseRequestId)!.push(visit);
        assigned.add(visit.id);
      }
    }

    for (let index = 0; index < feedsNewestFirst.length; index += 1) {
      const feed = feedsNewestFirst[index];
      const windowStart = feed.createdAt.getTime();
      const windowEnd =
        index === 0
          ? Number.POSITIVE_INFINITY
          : feedsNewestFirst[index - 1].createdAt.getTime();

      for (const visit of visits) {
        if (assigned.has(visit.id)) {
          continue;
        }
        const at = visit.createdAt.getTime();
        if (at >= windowStart && at < windowEnd) {
          feedVisitMap.get(feed.id)!.push(visit);
          assigned.add(visit.id);
        }
      }
    }

    const feeds: FeederFeedDto[] = await Promise.all(
      feedsNewestFirst.map(async (feed) => {
        const sectionVisits = (feedVisitMap.get(feed.id) ?? []).sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
        );
        return {
          id: feed.id,
          fedAt: feed.createdAt.toISOString(),
          proof: await this.signProof(feed),
          visits: await Promise.all(
            sectionVisits.map((visit) => this.toClipDto(visit)),
          ),
        };
      }),
    );

    const ungrouped = visits
      .filter((visit) => !assigned.has(visit.id))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return {
      feeds,
      ungroupedVisits: await Promise.all(
        ungrouped.map((visit) => this.toClipDto(visit)),
      ),
    };
  }

  private async signProof(
    feed: DispenseRequest,
  ): Promise<{ playbackUrl: string; expiresAt: string } | null> {
    if (!feed.proofKey) {
      return null;
    }
    return this.feederPlaybackService.signPlayback(feed.proofKey);
  }

  private async toClipDto(visit: FeederVisit): Promise<FeederClipDto> {
    const playback = await this.feederPlaybackService.signPlayback(
      visit.videoKey,
    );
    return {
      id: visit.id,
      recordedAt: visit.createdAt.toISOString(),
      animalCount: visit.animalCount,
      crowCount: visit.crowCount,
      playbackUrl: playback.playbackUrl,
      expiresAt: playback.expiresAt,
    };
  }
}
