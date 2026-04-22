type RankedScore = { id: string; score: number };

function zNormalize(scores: RankedScore[]) {
  if (scores.length === 0) return new Map<string, number>();
  const mean = scores.reduce((sum, item) => sum + item.score, 0) / scores.length;
  const variance = scores.reduce((sum, item) => sum + (item.score - mean) ** 2, 0) / scores.length;
  const std = Math.sqrt(variance) || 1;

  return new Map(scores.map((item) => [item.id, (item.score - mean) / std]));
}

export function fuseWithRRF(rankings: RankedScore[][], k = 60): Map<string, number> {
  const fused = new Map<string, number>();

  rankings.forEach((ranking) => {
    ranking.forEach((item, index) => {
      const contribution = 1 / (k + index + 1);
      fused.set(item.id, (fused.get(item.id) || 0) + contribution);
    });
  });

  return fused;
}

export function fuseWithDBSF(rankings: RankedScore[][]): Map<string, number> {
  const fused = new Map<string, number>();

  rankings.forEach((ranking) => {
    const normalized = zNormalize(ranking);
    normalized.forEach((score, id) => {
      fused.set(id, (fused.get(id) || 0) + score);
    });
  });

  return fused;
}
