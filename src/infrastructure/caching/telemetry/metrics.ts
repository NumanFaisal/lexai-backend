// src/infrastructure/caching/telemetry/metrics.ts
import { EngineMetrics } from '../../../modules/observability/metrics';

export const trackCacheHit = async (namespace: string): Promise<void> => {
  await EngineMetrics.increment(`cache:${namespace}:hit`);
};

export const trackCacheMiss = async (namespace: string): Promise<void> => {
  await EngineMetrics.increment(`cache:${namespace}:miss`);
};

export const trackPipelineLatency = async (pipeline: string, latencyMs: number): Promise<void> => {
  await EngineMetrics.increment(`pipeline:${pipeline}:invocations`);
  await EngineMetrics.recordLatency(pipeline, latencyMs);
};