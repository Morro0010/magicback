import { calculateReviewAverage, REVIEW_RATING_FIELDS } from './reviews.service';
import type { ReviewRatingField } from './reviews.service';

function makeRatings(value: number) {
  return REVIEW_RATING_FIELDS.reduce(
    (ratings, field) => {
      ratings[field] = value;
      return ratings;
    },
    {} as Record<ReviewRatingField, number>,
  );
}

describe('ReviewsService', () => {
  it('calculates the average from the eight review categories', () => {
    const ratings = {
      ...makeRatings(4),
      satisfaccionGeneral: 5,
      recomendariaMagicCity: 3,
    };

    expect(calculateReviewAverage(ratings)).toBe(4);
  });
});
