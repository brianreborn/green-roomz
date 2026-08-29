const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export function aggregateMeasurements(samples) {
  const valid = samples.filter((sample) => Number.isFinite(sample.promptTps) && Number.isFinite(sample.generationTps));
  if (!valid.length) return null;
  return {
    promptTps: median(valid.map((sample) => sample.promptTps)),
    generationTps: median(valid.map((sample) => sample.generationTps)),
    coldStartMs: median(valid.map((sample) => sample.coldStartMs ?? 0)),
    peakCommitMiB: median(valid.map((sample) => sample.peakCommitMiB ?? 0)),
  };
}

export function scoreProfile(metrics, objective = 'balanced') {
  if (!metrics) return Number.NEGATIVE_INFINITY;
  if (objective === 'interactive') return metrics.generationTps * 0.75 + metrics.promptTps * 0.2 - metrics.coldStartMs / 100_000;
  if (objective === 'throughput') return metrics.promptTps * 0.65 + metrics.generationTps * 0.3 - metrics.coldStartMs / 200_000;
  return metrics.promptTps * 0.45 + metrics.generationTps * 0.5 - metrics.coldStartMs / 150_000;
}

export function selectProfile(results, objective = 'balanced') {
  const ranked = results
    .map((result) => ({ ...result, metrics: result.metrics ?? aggregateMeasurements(result.samples ?? []) }))
    .map((result) => ({ ...result, score: scoreProfile(result.metrics, objective) }))
    .filter((result) => Number.isFinite(result.score))
    .sort((a, b) => b.score - a.score || a.profile.id.localeCompare(b.profile.id));
  return { winner: ranked[0] ?? null, ranked };
}
