import { fsrs, Rating, Grade, Card, createEmptyCard } from 'ts-fsrs';
import { FSRSData, FSRSProfile, Memory, ReviewEvent, ReviewMode } from './types';

const f = fsrs();

function getScheduler(profile?: FSRSProfile) {
  if (!profile || profile.status !== 'optimized') {
    return f;
  }

  return fsrs({
    w: profile.parameters,
    request_retention: profile.desiredRetention || profile.recommendedRetention || 0.9,
  });
}

export function getInitialFSRSData(): FSRSData {
  const card = createEmptyCard();
  return {
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state
  };
}

export function reviewCard(
  fsrsData: FSRSData | undefined,
  grade: Grade,
  now: Date = new Date(),
  profile?: FSRSProfile
): FSRSData {
  let card: Card;
  if (!fsrsData) {
    card = createEmptyCard();
  } else {
    card = {
      due: new Date(fsrsData.due),
      stability: fsrsData.stability,
      difficulty: fsrsData.difficulty,
      elapsed_days: fsrsData.elapsed_days,
      scheduled_days: fsrsData.scheduled_days,
      learning_steps: fsrsData.learning_steps || 0,
      reps: fsrsData.reps,
      lapses: fsrsData.lapses,
      state: fsrsData.state,
      last_review: new Date(now.getTime() - Math.max(0, fsrsData.elapsed_days || 0) * 86400000)
    };
  }

  const scheduling_cards = getScheduler(profile).repeat(card, now);
  const nextCard = scheduling_cards[grade].card;

  return {
    due: nextCard.due.getTime(),
    stability: nextCard.stability,
    difficulty: nextCard.difficulty,
    elapsed_days: nextCard.elapsed_days,
    scheduled_days: nextCard.scheduled_days,
    learning_steps: nextCard.learning_steps,
    reps: nextCard.reps,
    lapses: nextCard.lapses,
    state: nextCard.state
  };
}

export function calculateMetrics(
  fsrsData: FSRSData | undefined,
  lastReviewed?: number,
  now: Date = new Date(),
  profile?: FSRSProfile
): { confidence: number, mastery: number } {
  if (!fsrsData) {
    return { confidence: 0, mastery: 0 };
  }

  const card: Card = {
    due: new Date(fsrsData.due),
    stability: fsrsData.stability,
    difficulty: fsrsData.difficulty,
    elapsed_days: fsrsData.elapsed_days,
    scheduled_days: fsrsData.scheduled_days,
    learning_steps: fsrsData.learning_steps || 0,
    reps: fsrsData.reps,
    lapses: fsrsData.lapses,
    state: fsrsData.state,
    last_review: lastReviewed ? new Date(lastReviewed) : undefined
  };

  // Retrievability (probability of recall) maps well to confidence
  let retrievability = 0;
  if (card.state === 0) { // New card
    retrievability = 0;
  } else if (card.last_review) {
    try {
      const r = getScheduler(profile).get_retrievability(card, now) as any;
      retrievability = typeof r === 'number' ? r : parseFloat(r) / 100;
    } catch (e) {
      retrievability = 0;
    }
  }
  
  const confidence = Math.max(0, Math.min(100, Math.round(retrievability * 100)));

  // Stability maps to mastery. A stability of 365 days means very high mastery.
  // We use a logarithmic/bounded function to map stability (days) to 0-100.
  // Example: S=1 -> ~10, S=10 -> ~30, S=100 -> ~60, S=365 -> ~90
  const mastery = Math.max(0, Math.min(100, Math.round((Math.log10(card.stability + 1) / Math.log10(365 + 1)) * 100)));

  return { confidence, mastery };
}

export function createReviewEvent(params: {
  memory: Memory;
  rating: Grade;
  reviewedAt: number;
  previousFsrs?: FSRSData;
  nextFsrs: FSRSData;
  mode: ReviewMode;
}): ReviewEvent {
  const { memory, rating, reviewedAt, previousFsrs, nextFsrs, mode } = params;
  const lastReviewedAt = memory.lastReviewed || memory.createdAt;
  const elapsedDays = Math.max(0, Math.floor((reviewedAt - lastReviewedAt) / 86400000));

  return {
    id: crypto.randomUUID(),
    memoryId: memory.id,
    subject: memory.subject,
    rating: rating as 1 | 2 | 3 | 4,
    reviewedAt,
    elapsedDays,
    scheduledDays: previousFsrs?.scheduled_days || 0,
    previousState: previousFsrs?.state,
    nextState: nextFsrs.state,
    stabilityBefore: previousFsrs?.stability,
    stabilityAfter: nextFsrs.stability,
    difficultyBefore: previousFsrs?.difficulty,
    difficultyAfter: nextFsrs.difficulty,
    mode,
  };
}

export { Rating };
export type { Grade };
