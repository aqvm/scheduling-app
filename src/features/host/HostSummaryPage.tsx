import { useMemo } from 'react';
import { formatDateKey, toDateKey } from '../../shared/scheduler/date';
import { getStatusLabel, getStatusScore } from '../../shared/scheduler/status';
import type { AvailabilityStatus, UserProfile } from '../../shared/scheduler/types';

/**
 * Aggregated per-date scoring details for host ranking and matrix output.
 */
type DateScoreSummary = {
  dateKey: string;
  availableCount: number;
  maybeCount: number;
  unavailableCount: number;
  unspecifiedCount: number;
  score: number;
};

/**
 * Props for the host-level summary page.
 */
type HostSummaryPageProps = {
  users: UserProfile[];
  currentUser: UserProfile;
  hostUserId: string;
  monthDateKeys: string[];
  getStatus: (userId: string, dateKey: string) => AvailabilityStatus;
};

/**
 * Read-only analytics view for host/admin users.
 */
export function HostSummaryPage({
  users,
  currentUser,
  hostUserId,
  monthDateKeys,
  getStatus
}: HostSummaryPageProps) {
  const canView = currentUser.role === 'admin' || currentUser.id === hostUserId;
  const todayDateKey = toDateKey(new Date());
  const futureDateKeys = monthDateKeys.filter((dateKey) => dateKey >= todayDateKey);

  if (!canView) {
    return (
      <section className="page-card">
        <h2>Host Summary</h2>
        <p>This page is available only to the selected host and admin.</p>
      </section>
    );
  }

  const allGreenDates = futureDateKeys.filter(
    (dateKey) => users.length > 0 && users.every((user) => getStatus(user.id, dateKey) === 'available')
  );
  const anyRedDates = futureDateKeys.filter((dateKey) =>
    users.some((user) => getStatus(user.id, dateKey) === 'unavailable')
  );

  const rankedDateSummaries = useMemo(() => {
    const dateSummaries: DateScoreSummary[] = futureDateKeys.map((dateKey) => {
      let availableCount = 0;
      let maybeCount = 0;
      let unavailableCount = 0;
      let unspecifiedCount = 0;
      let score = 0;

      users.forEach((user) => {
        const status = getStatus(user.id, dateKey);
        score += getStatusScore(status);

        if (status === 'available') {
          availableCount += 1;
          return;
        }

        if (status === 'maybe') {
          maybeCount += 1;
          return;
        }

        if (status === 'unavailable') {
          unavailableCount += 1;
          return;
        }

        unspecifiedCount += 1;
      });

      return {
        dateKey,
        availableCount,
        maybeCount,
        unavailableCount,
        unspecifiedCount,
        score
      };
    });

    return dateSummaries.sort((left, right) => {
      // Sort priority: highest score, then fewer hard conflicts, then more strong votes.
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (left.unavailableCount !== right.unavailableCount) {
        return left.unavailableCount - right.unavailableCount;
      }

      if (right.availableCount !== left.availableCount) {
        return right.availableCount - left.availableCount;
      }

      return left.dateKey.localeCompare(right.dateKey);
    });
  }, [futureDateKeys, users, getStatus]);

  const topCandidateDates = rankedDateSummaries
    .filter((dateSummary) => dateSummary.availableCount + dateSummary.maybeCount + dateSummary.unavailableCount > 0)
    .slice(0, 5);

  return (
    <section className="page-card">
      <h2>Host Summary</h2>
      <p>Month view for campaign members. Past dates are hidden.</p>

      <div className="kpi-grid">
        <article>
          <h3>{allGreenDates.length}</h3>
          <p>Dates Fully Green</p>
        </article>
        <article>
          <h3>{anyRedDates.length}</h3>
          <p>Dates With Any Red</p>
        </article>
      </div>

      <section className="summary-block">
        <h3>Top Candidate Dates</h3>
        {topCandidateDates.length === 0 ? (
          <p className="empty-note">No dates in this month yet.</p>
        ) : (
          <ul className="list-reset">
            {topCandidateDates.map((dateSummary) => (
              <li key={dateSummary.dateKey} className="summary-row">
                <strong>{formatDateKey(dateSummary.dateKey)}</strong>
                <span className="summary-score">Score: {dateSummary.score}</span>
                <span>
                  Available {dateSummary.availableCount} | Maybe {dateSummary.maybeCount} | Unavailable{' '}
                  {dateSummary.unavailableCount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="summary-block">
        <h3>Availability Matrix</h3>
        {rankedDateSummaries.length === 0 ? (
          <p className="empty-note">No current or future dates in this month.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Score</th>
                  {users.map((user) => (
                    <th key={user.id}>{user.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rankedDateSummaries.map((dateSummary) => (
                  <tr key={dateSummary.dateKey} className={`score-row score-${dateSummary.score > 0 ? 'positive' : dateSummary.score < 0 ? 'negative' : 'neutral'}`}>
                    <td>{formatDateKey(dateSummary.dateKey)}</td>
                    <td>
                      <span className={`score-pill score-pill-${dateSummary.score > 0 ? 'positive' : dateSummary.score < 0 ? 'negative' : 'neutral'}`}>
                        {dateSummary.score}
                      </span>
                    </td>
                    {users.map((user) => {
                      const status = getStatus(user.id, dateSummary.dateKey);
                      return (
                        <td key={`${dateSummary.dateKey}-${user.id}`}>
                          <span className={`status-pill status-${status}`}>{getStatusLabel(status)}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
