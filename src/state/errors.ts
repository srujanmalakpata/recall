/**
 * Thrown by gradeCard when the stored card is no longer reviewable today, typically
 * because another tab already graded it. Not a storage failure, so the store shows no
 * error banner: the review screen simply drops the card from its queue.
 */
export class StaleReviewError extends Error {
  constructor() {
    super('This card was already reviewed in another tab.');
    this.name = 'StaleReviewError';
  }
}
