/**
 * A small hand-rolled SVG bar chart (no chart library): one series, a zero
 * baseline, a recessive grid, a max-value label and a native <title> tooltip per bar.
 * The same numbers are always available in a table for screen readers and for
 * anyone who prefers exact values.
 */
import { useId } from 'react';
import type { DayCount } from '../domain/stats';
import { dayToIsoDate, dayToShortLabel } from '../domain/days';
import { niceMax } from './chartScale';

interface BarChartProps {
  readonly title: string;
  readonly data: readonly DayCount[];
  /** Unit noun for tooltips, e.g. "reviews" or "cards due". */
  readonly unit: string;
  /** Label every n-th day on the x axis. */
  readonly labelEvery?: number;
}

const WIDTH = 600;
const HEIGHT = 200;
const PAD = { top: 16, right: 8, bottom: 28, left: 32 };
const GAP = 2;

export function BarChart({ title, data, unit, labelEvery = 7 }: BarChartProps) {
  const titleId = useId();
  const max = niceMax(Math.max(0, ...data.map((d) => d.count)));
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(1, data.length);
  const barW = Math.max(1, slot - GAP);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const gridValues = [0, max / 2, max];

  return (
    <figure className="chart">
      <figcaption id={titleId}>
        {title} <span className="chart-total">({total} total)</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-labelledby={titleId}
        preserveAspectRatio="xMidYMid meet"
      >
        {gridValues.map((v) => (
          <g key={v}>
            <line className="chart-grid" x1={PAD.left} x2={WIDTH - PAD.right} y1={y(v)} y2={y(v)} />
            <text className="chart-axis" x={PAD.left - 6} y={y(v)} dy="0.32em" textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = PAD.left + i * slot + GAP / 2;
          const h = Math.max(0, y(0) - y(d.count));
          return (
            <g key={d.day}>
              {d.count > 0 && (
                <path className="chart-bar" d={barPath(x, y(0), barW, h)}>
                  <title>{`${dayToIsoDate(d.day)}: ${d.count} ${unit}`}</title>
                </path>
              )}
              {i % labelEvery === 0 && (
                <text className="chart-axis" x={x + barW / 2} y={HEIGHT - 8} textAnchor="middle">
                  {dayToShortLabel(d.day)}
                </text>
              )}
            </g>
          );
        })}
        <line className="chart-baseline" x1={PAD.left} x2={WIDTH - PAD.right} y1={y(0)} y2={y(0)} />
      </svg>
      <details>
        <summary>Show as table</summary>
        <table>
          <caption className="visually-hidden">{title}</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">{unit}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.day}>
                <td>{dayToIsoDate(d.day)}</td>
                <td>{d.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** A bar anchored to the baseline with only its top corners rounded. */
function barPath(x: number, baseline: number, width: number, height: number): string {
  const r = Math.min(4, width / 2, height);
  const top = baseline - height;
  return [
    `M${x},${baseline}`,
    `V${top + r}`,
    `Q${x},${top} ${x + r},${top}`,
    `H${x + width - r}`,
    `Q${x + width},${top} ${x + width},${top + r}`,
    `V${baseline}`,
    'Z',
  ].join(' ');
}
