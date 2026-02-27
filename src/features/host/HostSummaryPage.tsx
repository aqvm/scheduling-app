import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDateKey, getMonthDates, getMonthLabel, toDateKey } from '../../shared/scheduler/date';
import { MonthNavigator } from '../../shared/scheduler/MonthNavigator';
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
  monthValue: string;
  setMonthValue: (value: string) => void;
  monthDateKeys: string[];
  getStatus: (userId: string, dateKey: string) => AvailabilityStatus;
};

function getCompactStatusLabel(status: AvailabilityStatus): string {
  switch (status) {
    case 'available':
      return 'Avail';
    case 'unavailable':
      return 'No';
    case 'unspecified':
      return 'Unset';
    case 'maybe':
    default:
      return 'Maybe';
  }
}

/**
 * Read-only analytics view for host/admin users.
 */
export function HostSummaryPage({
  users,
  currentUser,
  hostUserId,
  monthValue,
  setMonthValue,
  monthDateKeys,
  getStatus
}: HostSummaryPageProps) {
  const canView = currentUser.role === 'admin' || currentUser.id === hostUserId;
  const totalPlayers = users.length;
  const todayDateKey = toDateKey(new Date());
  const futureDateKeys = monthDateKeys.filter((dateKey) => dateKey >= todayDateKey);
  const monthLabel = getMonthLabel(getMonthDates(monthValue));
  const matrixTableWrapRef = useRef<HTMLDivElement | null>(null);
  const matrixStickyScrollbarRef = useRef<HTMLDivElement | null>(null);
  const [matrixScrollbarWidth, setMatrixScrollbarWidth] = useState(0);
  const [showMatrixStickyScrollbar, setShowMatrixStickyScrollbar] = useState(false);

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
  const allAvailableDateKeys = new Set(allGreenDates);

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

  useEffect(() => {
    const tableWrapElement = matrixTableWrapRef.current;
    const stickyScrollbarElement = matrixStickyScrollbarRef.current;
    if (!tableWrapElement || !stickyScrollbarElement) {
      return;
    }

    let syncingFromTable = false;
    let syncingFromStickyScrollbar = false;

    const isNativeScrollbarVisible = () => {
      const tableWrapRect = tableWrapElement.getBoundingClientRect();
      return (
        tableWrapRect.bottom <= window.innerHeight &&
        tableWrapRect.bottom >= 0 &&
        tableWrapRect.top < window.innerHeight
      );
    };

    const syncDimensions = () => {
      const scrollWidth = tableWrapElement.scrollWidth;
      const clientWidth = tableWrapElement.clientWidth;
      const hasHorizontalOverflow = scrollWidth > clientWidth + 1;
      const nativeScrollbarVisible = isNativeScrollbarVisible();

      setMatrixScrollbarWidth(scrollWidth);
      setShowMatrixStickyScrollbar(hasHorizontalOverflow && !nativeScrollbarVisible);

      if (hasHorizontalOverflow) {
        stickyScrollbarElement.scrollLeft = tableWrapElement.scrollLeft;
      }
    };

    const onTableScroll = () => {
      if (syncingFromStickyScrollbar) {
        return;
      }

      syncingFromTable = true;
      stickyScrollbarElement.scrollLeft = tableWrapElement.scrollLeft;
      syncingFromTable = false;
    };

    const onStickyScrollbarScroll = () => {
      if (syncingFromTable) {
        return;
      }

      syncingFromStickyScrollbar = true;
      tableWrapElement.scrollLeft = stickyScrollbarElement.scrollLeft;
      syncingFromStickyScrollbar = false;
    };

    const resizeObserver = new ResizeObserver(syncDimensions);
    resizeObserver.observe(tableWrapElement);

    const tableElement = tableWrapElement.querySelector('table');
    if (tableElement) {
      resizeObserver.observe(tableElement);
    }

    tableWrapElement.addEventListener('scroll', onTableScroll, { passive: true });
    stickyScrollbarElement.addEventListener('scroll', onStickyScrollbarScroll, { passive: true });
    window.addEventListener('resize', syncDimensions);
    window.addEventListener('scroll', syncDimensions, { passive: true });
    syncDimensions();

    return () => {
      resizeObserver.disconnect();
      tableWrapElement.removeEventListener('scroll', onTableScroll);
      stickyScrollbarElement.removeEventListener('scroll', onStickyScrollbarScroll);
      window.removeEventListener('resize', syncDimensions);
      window.removeEventListener('scroll', syncDimensions);
    };
  }, [rankedDateSummaries.length, users.length]);

  return (
    <section className="page-card">
      <h2>Host Summary</h2>
      <p>Month view for campaign members. Past dates are hidden.</p>
      <div className="month-row">
        <h3 className="month-heading">{monthLabel}</h3>
        <MonthNavigator
          monthValue={monthValue}
          onChangeMonth={setMonthValue}
          ariaLabel="Host summary month navigation"
        />
      </div>

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
              <li
                key={dateSummary.dateKey}
                className={`summary-row ${allAvailableDateKeys.has(dateSummary.dateKey) ? 'summary-row-all-available' : ''}`}
              >
                <strong>{formatDateKey(dateSummary.dateKey)}</strong>
                <span className="summary-score">Score: {dateSummary.score}</span>
                <span>
                  Available {dateSummary.availableCount}/{totalPlayers} | Maybe{' '}
                  {dateSummary.maybeCount}/{totalPlayers} | Unavailable{' '}
                  {dateSummary.unavailableCount}/{totalPlayers}
                </span>
                {allAvailableDateKeys.has(dateSummary.dateKey) ? (
                  <span className="all-available-badge">All players are available</span>
                ) : null}
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
          <div className="matrix-scroll-shell">
            <div className="table-wrap matrix-table-wrap" ref={matrixTableWrapRef}>
              <table className="availability-matrix-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Score</th>
                    {users.map((user) => (
                      <th key={user.id}>{user.alias}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rankedDateSummaries.map((dateSummary, index) => (
                    <tr
                      key={dateSummary.dateKey}
                      className={`score-row matrix-row-${index % 2 === 0 ? 'odd' : 'even'} score-${dateSummary.score > 0 ? 'positive' : dateSummary.score < 0 ? 'negative' : 'neutral'} ${allAvailableDateKeys.has(dateSummary.dateKey) ? 'score-all-available' : ''}`}
                    >
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
                            <span className={`status-pill status-${status}`}>
                              <span className="status-long">{getStatusLabel(status)}</span>
                              <span className="status-short" aria-hidden="true">
                                {getCompactStatusLabel(status)}
                              </span>
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div
              ref={matrixStickyScrollbarRef}
              className={`matrix-sticky-scrollbar ${showMatrixStickyScrollbar ? '' : 'matrix-sticky-scrollbar-hidden'}`.trim()}
              aria-hidden="true"
            >
              <div className="matrix-sticky-scrollbar-track" style={{ width: `${matrixScrollbarWidth}px` }} />
            </div>
          </div>
        )}
      </section>
    </section>
  );
}
