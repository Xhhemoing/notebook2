import { fsrs, Rating, Grade, Card, createEmptyCard } from 'ts-fsrs';
import { FSRSData } from './types';

const f = fsrs();

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

export function reviewCard(fsrsData: FSRSData | undefined, grade: Grade, now: Date = new Date()): FSRSData {
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
      last_review: new Date() // approximate
    };
  }

  const scheduling_cards = f.repeat(card, now);
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

export function calculateMetrics(fsrsData: FSRSData | undefined, lastReviewed?: number, now: Date = new Date()): { confidence: number, mastery: number } {
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
      const r = f.get_retrievability(card, now) as any;
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

export { Rating };
export type { Grade };
