import { NavLink, Route, Routes } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';

type AvailabilityStatus = 'unspecified' | 'available' | 'maybe' | 'unavailable';

type UserProfile = {
  id: string;
  name: string;
  isHost: boolean;
};

type AvailabilityByUser = Record<string, Record<string, AvailabilityStatus>>;

type PersistedState = {
  activeUserId: string;
  availability: AvailabilityByUser;
};

const STORAGE_KEY = 'dnd_scheduler_state_v1';
const STATUS_CYCLE: AvailabilityStatus[] = ['unspecified', 'available', 'maybe', 'unavailable'];
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const usersSeed: UserProfile[] = [
  { id: 'u1', name: 'Avery (Host)', isHost: true },
  { id: 'u2', name: 'Morgan', isHost: false },
  { id: 'u3', name: 'Riley', isHost: false },
  { id: 'u4', name: 'Jordan', isHost: false }
];

function padTwo(value: number): string {
  return String(value).padStart(2, '0');
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}-${padTwo(date.getDate())}`;
}

function getCurrentMonthDates(reference = new Date()): Date[] {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dates: Date[] = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    dates.push(new Date(year, month, day));
  }

  return dates;
}

function getMonthLabel(dates: Date[]): string {
  if (dates.length === 0) {
    return '';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric'
  }).format(dates[0]);
}

function formatDateKey(dateKey: string): string {
  const [yearPart, monthPart, dayPart] = dateKey.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return dateKey;
  }

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }).format(new Date(year, month - 1, day));
}

function isAvailabilityStatus(value: unknown): value is AvailabilityStatus {
  return (
    typeof value === 'string' &&
    (value === 'unspecified' || value === 'available' || value === 'maybe' || value === 'unavailable')
  );
}

function sanitizeAvailability(raw: unknown): AvailabilityByUser {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const clean: AvailabilityByUser = {};

  for (const [userId, userValue] of Object.entries(raw as Record<string, unknown>)) {
    if (!userValue || typeof userValue !== 'object') {
      continue;
    }

    const cleanUserDays: Record<string, AvailabilityStatus> = {};

    for (const [dateKey, statusValue] of Object.entries(userValue as Record<string, unknown>)) {
      if (isAvailabilityStatus(statusValue)) {
        cleanUserDays[dateKey] = statusValue;
      }
    }

    clean[userId] = cleanUserDays;
  }

  return clean;
}

function loadInitialState(users: UserProfile[]): PersistedState {
  const fallback: PersistedState = {
    activeUserId: users[0]?.id ?? '',
    availability: {}
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    const activeUserId =
      typeof parsed.activeUserId === 'string' && users.some((user) => user.id === parsed.activeUserId)
        ? parsed.activeUserId
        : fallback.activeUserId;

    return {
      activeUserId,
      availability: sanitizeAvailability(parsed.availability)
    };
  } catch {
    return fallback;
  }
}

function getNextStatus(current: AvailabilityStatus): AvailabilityStatus {
  const currentIndex = STATUS_CYCLE.indexOf(current);
  const nextIndex = (currentIndex + 1) % STATUS_CYCLE.length;
  return STATUS_CYCLE[nextIndex];
}

function getStatusLabel(status: AvailabilityStatus): string {
  if (status === 'available') {
    return 'Available';
  }

  if (status === 'maybe') {
    return 'Maybe';
  }

  if (status === 'unavailable') {
    return 'Unavailable';
  }

  return 'Unspecified';
}

function PersonalAvailabilityPage({
  users,
  activeUserId,
  setActiveUserId,
  monthDates,
  getStatus,
  onToggleDate
}: {
  users: UserProfile[];
  activeUserId: string;
  setActiveUserId: (value: string) => void;
  monthDates: Date[];
  getStatus: (userId: string, dateKey: string) => AvailabilityStatus;
  onToggleDate: (dateKey: string) => void;
}) {
  const monthLabel = getMonthLabel(monthDates);
  const activeUser = users.find((user) => user.id === activeUserId) ?? users[0];
  const leadingEmptyCells = monthDates.length > 0 ? (monthDates[0].getDay() + 6) % 7 : 0;

  const gridCells: Array<Date | null> = [
    ...Array.from({ length: leadingEmptyCells }, () => null),
    ...monthDates
  ];

  const trailingEmptyCells = (7 - (gridCells.length % 7)) % 7;
  gridCells.push(...Array.from({ length: trailingEmptyCells }, () => null));

  return (
    <section className="page-card">
      <h2>My Availability</h2>
      <p>Pick your profile, then click each day to cycle status.</p>

      <label className="profile-picker" htmlFor="profile-select">
        Active Profile
        <select
          id="profile-select"
          value={activeUserId}
          onChange={(event) => setActiveUserId(event.target.value)}
        >
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
      </label>

      <h3 className="month-heading">{monthLabel}</h3>

      <div className="legend" aria-label="Availability legend">
        <span className="legend-item">
          <i className="chip chip-unspecified" /> Unspecified
        </span>
        <span className="legend-item">
          <i className="chip chip-available" /> Available
        </span>
        <span className="legend-item">
          <i className="chip chip-maybe" /> Maybe
        </span>
        <span className="legend-item">
          <i className="chip chip-unavailable" /> Unavailable
        </span>
      </div>

      <div className="calendar-grid" role="grid" aria-label={`${monthLabel} availability calendar`}>
        {WEEKDAY_LABELS.map((weekday) => (
          <div key={weekday} className="weekday-cell" role="columnheader">
            {weekday}
          </div>
        ))}

        {gridCells.map((date, index) => {
          if (!date) {
            return <div key={`empty-${index}`} className="day-cell empty-cell" aria-hidden="true" />;
          }

          const dateKey = toDateKey(date);
          const status = getStatus(activeUser.id, dateKey);

          return (
            <button
              key={dateKey}
              type="button"
              className={`day-cell day-${status}`}
              role="gridcell"
              onClick={() => onToggleDate(dateKey)}
              aria-label={`${formatDateKey(dateKey)}: ${getStatusLabel(status)}`}
            >
              <span className="day-number">{date.getDate()}</span>
              <span className="day-status">{getStatusLabel(status)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function HostSummaryPage({
  users,
  activeUserId,
  monthDateKeys,
  getStatus
}: {
  users: UserProfile[];
  activeUserId: string;
  monthDateKeys: string[];
  getStatus: (userId: string, dateKey: string) => AvailabilityStatus;
}) {
  const activeUser = users.find((user) => user.id === activeUserId) ?? users[0];

  if (!activeUser?.isHost) {
    return (
      <section className="page-card">
        <h2>Host Summary</h2>
        <p>This page is host-only. Switch to the host profile to view group-wide availability.</p>
      </section>
    );
  }

  const allGreenDates = monthDateKeys.filter((dateKey) =>
    users.every((user) => getStatus(user.id, dateKey) === 'available')
  );

  const anyRedDates = monthDateKeys.filter((dateKey) =>
    users.some((user) => getStatus(user.id, dateKey) === 'unavailable')
  );

  return (
    <section className="page-card">
      <h2>Host Summary</h2>
      <p>Dates below are based on current-month availability for all group members.</p>

      <div className="kpi-grid">
        <article>
          <h3>{users.length}</h3>
          <p>Total Group Members</p>
        </article>
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
        <h3>Best Candidate Dates (Everyone Green)</h3>
        {allGreenDates.length === 0 ? (
          <p className="empty-note">No dates are fully green yet.</p>
        ) : (
          <ul className="list-reset">
            {allGreenDates.map((dateKey) => (
              <li key={dateKey} className="summary-row">
                {formatDateKey(dateKey)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="summary-block">
        <h3>Availability Matrix</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                {users.map((user) => (
                  <th key={user.id}>{user.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthDateKeys.map((dateKey) => (
                <tr key={dateKey}>
                  <td>{formatDateKey(dateKey)}</td>
                  {users.map((user) => {
                    const status = getStatus(user.id, dateKey);
                    return (
                      <td key={`${dateKey}-${user.id}`}>
                        <span className={`status-pill status-${status}`}>{getStatusLabel(status)}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

export default function App() {
  const users = usersSeed;
  const monthDates = useMemo(() => getCurrentMonthDates(new Date()), []);
  const monthDateKeys = useMemo(() => monthDates.map((date) => toDateKey(date)), [monthDates]);

  const [state, setState] = useState<PersistedState>(() => loadInitialState(users));

  const activeUserId = users.some((user) => user.id === state.activeUserId)
    ? state.activeUserId
    : users[0]?.id ?? '';

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          activeUserId,
          availability: state.availability
        })
      );
    } catch {
      // Ignore localStorage write errors to keep UI functional.
    }
  }, [activeUserId, state.availability]);

  const getStatus = (userId: string, dateKey: string): AvailabilityStatus => {
    return state.availability[userId]?.[dateKey] ?? 'unspecified';
  };

  const setActiveUserId = (nextUserId: string): void => {
    setState((current) => ({ ...current, activeUserId: nextUserId }));
  };

  const onToggleDate = (dateKey: string): void => {
    if (!activeUserId) {
      return;
    }

    setState((current) => {
      const userDays = current.availability[activeUserId] ?? {};
      const currentStatus = userDays[dateKey] ?? 'unspecified';
      const nextStatus = getNextStatus(currentStatus);

      return {
        ...current,
        availability: {
          ...current.availability,
          [activeUserId]: {
            ...userDays,
            [dateKey]: nextStatus
          }
        }
      };
    });
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>DnD Group Scheduler</h1>
        <p>Paint availability by day, then let the host find fully green dates.</p>
      </header>

      <nav className="top-nav" aria-label="Primary">
        <NavLink to="/" end>
          My Availability
        </NavLink>
        <NavLink to="/host">Host Summary</NavLink>
      </nav>

      <main>
        <Routes>
          <Route
            path="/"
            element={
              <PersonalAvailabilityPage
                users={users}
                activeUserId={activeUserId}
                setActiveUserId={setActiveUserId}
                monthDates={monthDates}
                getStatus={getStatus}
                onToggleDate={onToggleDate}
              />
            }
          />
          <Route
            path="/host"
            element={
              <HostSummaryPage
                users={users}
                activeUserId={activeUserId}
                monthDateKeys={monthDateKeys}
                getStatus={getStatus}
              />
            }
          />
        </Routes>
      </main>
    </div>
  );
}
