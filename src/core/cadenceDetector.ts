import type {
  CadenceFinding,
  EnemyPowerSummary,
  PowerCastEvent,
} from "../shared/types";

export interface PowerObservation {
  enemyId: string;
  enemyName: string;
  enemyInstanceId: string;
  abilityId: string;
  abilityName: string;
  occurredAt: number;
}

export interface CadenceOptions {
  episodeGapSeconds?: number;
  minimumIntervalSeconds?: number;
  maximumIntervalSeconds?: number;
}

interface EpisodeResult {
  castStarts: number[];
  intervalsSeconds: number[];
}

const DEFAULT_EPISODE_GAP_SECONDS = 5;
const DEFAULT_MINIMUM_INTERVAL_SECONDS = 6;
const DEFAULT_MAXIMUM_INTERVAL_SECONDS = 120;

export function buildEnemyPowerSummaries(
  observations: PowerObservation[],
  options: CadenceOptions = {},
): EnemyPowerSummary[] {
  const groups = new Map<string, PowerObservation[]>();

  for (const observation of observations) {
    const key = powerKey(observation.enemyId, observation.abilityId);
    const group = groups.get(key);
    if (group) {
      group.push(observation);
    } else {
      groups.set(key, [observation]);
    }
  }

  const summaries: EnemyPowerSummary[] = [];
  for (const [key, group] of groups) {
    const byInstance = new Map<string, PowerObservation[]>();
    for (const observation of group) {
      const instance = byInstance.get(observation.enemyInstanceId);
      if (instance) {
        instance.push(observation);
      } else {
        byInstance.set(observation.enemyInstanceId, [observation]);
      }
    }

    const castStarts: number[] = [];
    const intervals: number[] = [];
    for (const instanceObservations of byInstance.values()) {
      const episode = extractEpisodes(instanceObservations, options);
      castStarts.push(...episode.castStarts);
      intervals.push(...episode.intervalsSeconds);
    }

    castStarts.sort((a, b) => a - b);
    const sample = group[0];
    const cadence = analyzeIntervals({
      key,
      enemyId: sample.enemyId,
      enemyName: mostFrequent(group.map((item) => item.enemyName)),
      abilityId: sample.abilityId,
      abilityName: mostFrequent(group.map((item) => item.abilityName)),
      intervals,
      instanceCount: byInstance.size,
    });

    summaries.push({
      key,
      enemyId: sample.enemyId,
      enemyName: cadence.enemyName,
      abilityId: sample.abilityId,
      abilityName: cadence.abilityName,
      rawEventCount: group.length,
      castCount: castStarts.length,
      firstSeenAt: Math.min(...group.map((item) => item.occurredAt)),
      lastSeenAt: Math.max(...group.map((item) => item.occurredAt)),
      cadence,
    });
  }

  return summaries.sort((left, right) => {
    const rankDifference =
      classificationRank(right.cadence.classification) -
      classificationRank(left.cadence.classification);
    if (rankDifference !== 0) return rankDifference;
    return right.cadence.confidence - left.cadence.confidence;
  });
}

export function extractEpisodes(
  observations: PowerObservation[],
  options: CadenceOptions = {},
): EpisodeResult {
  const episodeGapMs =
    (options.episodeGapSeconds ?? DEFAULT_EPISODE_GAP_SECONDS) * 1_000;
  const minimumInterval =
    options.minimumIntervalSeconds ?? DEFAULT_MINIMUM_INTERVAL_SECONDS;
  const maximumInterval =
    options.maximumIntervalSeconds ?? DEFAULT_MAXIMUM_INTERVAL_SECONDS;

  const uniqueTimestamps = [...new Set(observations.map((item) => item.occurredAt))]
    .sort((a, b) => a - b);
  const castStarts: number[] = [];
  let previousTimestamp: number | null = null;

  for (const timestamp of uniqueTimestamps) {
    if (
      previousTimestamp === null ||
      timestamp - previousTimestamp > episodeGapMs
    ) {
      castStarts.push(timestamp);
    }
    previousTimestamp = timestamp;
  }

  const intervalsSeconds: number[] = [];
  for (let index = 1; index < castStarts.length; index += 1) {
    const interval = (castStarts[index] - castStarts[index - 1]) / 1_000;
    if (interval >= minimumInterval && interval <= maximumInterval) {
      intervalsSeconds.push(interval);
    }
  }

  return { castStarts, intervalsSeconds };
}

interface IntervalAnalysisInput {
  key: string;
  enemyId: string;
  enemyName: string;
  abilityId: string;
  abilityName: string;
  intervals: number[];
  instanceCount: number;
}

function analyzeIntervals(input: IntervalAnalysisInput): CadenceFinding {
  const {
    key,
    enemyId,
    enemyName,
    abilityId,
    abilityName,
    intervals,
    instanceCount,
  } = input;

  if (intervals.length < 3) {
    return {
      key,
      enemyId,
      enemyName,
      abilityId,
      abilityName,
      estimatedIntervalSeconds: null,
      medianAbsoluteDeviationSeconds: null,
      intervalCount: intervals.length,
      instanceCount,
      directMatchRate: 0,
      multipleMatchRate: 0,
      confidence: Math.min(25, intervals.length * 8),
      classification: "insufficient",
      observedRangeSeconds: null,
    };
  }

  const sorted = [...intervals].sort((a, b) => a - b);
  const trimmed = trimUpperOutliers(sorted);
  const estimatedInterval = median(trimmed);
  const deviations = trimmed.map((value) => Math.abs(value - estimatedInterval));
  const medianAbsoluteDeviation = median(deviations);
  const tolerance = Math.max(1.5, estimatedInterval * 0.08);

  const directMatches = sorted.filter(
    (value) => Math.abs(value - estimatedInterval) <= tolerance,
  ).length;
  const multipleMatches = sorted.filter((value) =>
    [1, 2, 3].some(
      (multiple) =>
        Math.abs(value - estimatedInterval * multiple) <= tolerance * multiple,
    ),
  ).length;

  const directMatchRate = directMatches / sorted.length;
  const multipleMatchRate = multipleMatches / sorted.length;
  const normalizedDeviation = medianAbsoluteDeviation / estimatedInterval;
  const sampleScore = Math.min(1, sorted.length / 18);
  const instanceScore = Math.min(1, instanceCount / 3);
  const dispersionScore = Math.max(0, 1 - normalizedDeviation * 7);
  const confidence = Math.round(
    100 *
      (directMatchRate * 0.45 +
        multipleMatchRate * 0.15 +
        dispersionScore * 0.2 +
        sampleScore * 0.12 +
        instanceScore * 0.08),
  );

  let classification: CadenceFinding["classification"] = "variable";
  if (
    sorted.length >= 10 &&
    instanceCount >= 2 &&
    directMatchRate >= 0.78 &&
    normalizedDeviation <= 0.07
  ) {
    classification = "high";
  } else if (
    sorted.length >= 5 &&
    instanceCount >= 2 &&
    directMatchRate >= 0.65 &&
    normalizedDeviation <= 0.13
  ) {
    classification = "medium";
  }

  const robustRange = percentileRange(trimmed, 0.1, 0.9);
  return {
    key,
    enemyId,
    enemyName,
    abilityId,
    abilityName,
    estimatedIntervalSeconds: roundToTenth(estimatedInterval),
    medianAbsoluteDeviationSeconds: roundToTenth(medianAbsoluteDeviation),
    intervalCount: sorted.length,
    instanceCount,
    directMatchRate,
    multipleMatchRate,
    confidence: Math.max(0, Math.min(100, confidence)),
    classification,
    observedRangeSeconds: [
      roundToTenth(robustRange[0]),
      roundToTenth(robustRange[1]),
    ],
  };
}

export class LiveCastDetector {
  private readonly lastSeen = new Map<string, number>();

  constructor(private readonly episodeGapSeconds = 5) {}

  observe(observation: PowerObservation): PowerCastEvent | null {
    const key = `${observation.enemyInstanceId}|${observation.abilityId}`;
    const previous = this.lastSeen.get(key);
    this.lastSeen.set(key, observation.occurredAt);
    if (
      previous !== undefined &&
      observation.occurredAt - previous <= this.episodeGapSeconds * 1_000
    ) {
      return null;
    }

    return {
      key: powerKey(observation.enemyId, observation.abilityId),
      enemyId: observation.enemyId,
      enemyName: observation.enemyName,
      enemyInstanceId: observation.enemyInstanceId,
      abilityId: observation.abilityId,
      abilityName: observation.abilityName,
      occurredAt: observation.occurredAt,
    };
  }

  reset(): void {
    this.lastSeen.clear();
  }
}

export function powerKey(enemyId: string, abilityId: string): string {
  return `${enemyId}|${abilityId}`;
}

function trimUpperOutliers(sorted: number[]): number[] {
  if (sorted.length < 6) return sorted;
  const firstQuartile = quantile(sorted, 0.25);
  const thirdQuartile = quantile(sorted, 0.75);
  const interquartileRange = thirdQuartile - firstQuartile;
  const upperFence = thirdQuartile + interquartileRange * 1.5;
  const trimmed = sorted.filter((value) => value <= upperFence);
  return trimmed.length >= Math.ceil(sorted.length * 0.6) ? trimmed : sorted;
}

function percentileRange(
  sorted: number[],
  lower: number,
  upper: number,
): [number, number] {
  return [quantile(sorted, lower), quantile(sorted, upper)];
}

function median(values: number[]): number {
  return quantile([...values].sort((a, b) => a - b), 0.5);
}

function quantile(sorted: number[], percentile: number): number {
  if (sorted.length === 0) return 0;
  const position = (sorted.length - 1) * percentile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function mostFrequent(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "Bilinmeyen";
}

function classificationRank(classification: CadenceFinding["classification"]): number {
  switch (classification) {
    case "high":
      return 4;
    case "medium":
      return 3;
    case "variable":
      return 2;
    case "insufficient":
      return 1;
  }
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}
