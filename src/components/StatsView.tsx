import { useMemo } from 'react';
import { countCards, dueForecast, retention, reviewsPerDay } from '../domain/stats';
import { useStore } from '../state/store';
import { BarChart } from './BarChart';
import { PageHeading } from './PageHeading';

export function StatsView() {
  const { state, today } = useStore();
  const perDay = useMemo(() => reviewsPerDay(state.reviews, today, 30), [state.reviews, today]);
  const kept = useMemo(() => retention(state.reviews, today, 30), [state.reviews, today]);
  const forecast = useMemo(() => dueForecast(state.cards, today, 14), [state.cards, today]);
  const counts = useMemo(() => countCards(state.cards, today), [state.cards, today]);
  const reviewsToday = perDay.at(-1)?.count ?? 0;

  return (
    <section>
      <PageHeading>Statistics</PageHeading>
      <dl className="tiles">
        <div className="tile">
          <dt>Reviews today</dt>
          <dd data-testid="reviews-today">{reviewsToday}</dd>
        </div>
        <div className="tile">
          <dt>Retention (30 days)</dt>
          <dd data-testid="retention">{kept.rate === null ? '–' : `${Math.round(kept.rate * 100)}%`}</dd>
          <dd className="tile-note">
            {kept.total === 0
              ? 'No reviews of learned cards yet'
              : `${kept.passed} of ${kept.total} reviews of learned cards recalled`}
          </dd>
        </div>
        <div className="tile">
          <dt>Due now</dt>
          <dd data-testid="due-now">{counts.due}</dd>
        </div>
        <div className="tile">
          <dt>Cards</dt>
          <dd>{counts.total}</dd>
          <dd className="tile-note">
            {counts.newCards} new · {counts.learning} learning · {counts.mature} mature
          </dd>
        </div>
      </dl>
      <BarChart title="Reviews per day, last 30 days" data={perDay} unit="reviews" labelEvery={7} />
      <BarChart title="Due forecast, next 14 days" data={forecast} unit="cards due" labelEvery={2} />
      <p className="hint">Overdue cards are counted on today. Mature means an interval of 21 days or more.</p>
    </section>
  );
}
