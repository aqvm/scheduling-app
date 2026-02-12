import { NavLink, Route, Routes } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';

type AvailabilityStatus = 'unspecified' | 'available' | 'maybe' | 'unavailable';
type UserRole = 'member' | 'admin';

type UserProfile = {
  id: string;
  name: string;
  role: UserRole;
};

type AvailabilityByUser = Record<string, Record<string, AvailabilityStatus>>;

type PersistedState = {
  users: UserProfile[];
  hostUserId: string;
  availability: AvailabilityByUser;
};

const STORAGE_KEY = 'dnd_scheduler_state_v2';
const SESSION_KEY = 'dnd_scheduler_session_v1';

const MEMBER_INVITE_CODE = import.meta.env.VITE_MEMBER_INVITE_CODE ?? 'party-members';
const ADMIN_INVITE_CODE = import.meta.env.VITE_ADMIN_INVITE_CODE ?? 'owner-admin';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PAINT_OPTIONS: Array<{ status: AvailabilityStatus; label: string }> = [
  { status: 'available', label: 'Available' },
  { status: 'maybe', label: 'Maybe' },
  { status: 'unavailable', label: 'Unavailable' },
  { status: 'unspecified', label: 'Clear' }
];

function padTwo(value: number): string {
  return String(value).padStart(2, '0');
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}-${padTwo(date.getDate())}`;
}

function toMonthValue(date: Date): string {
  return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}`;
}

function isValidMonthValue(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

function getMonthDates(monthValue: string): Date[] {
  if (!isValidMonthValue(monthValue)) {
    return getMonthDates(toMonthValue(new Date()));
  }

  const [yearPart, monthPart] = monthValue.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return getMonthDates(toMonthValue(new Date()));
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const dates: Date[] = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    dates.push(new Date(year, month - 1, day));
  }

  return dates;
}

function getMonthLabel(monthDates: Date[]): string {
  if (monthDates.length === 0) {
    return '';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric'
  }).format(monthDates[0]);
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

function isUserRole(value: unknown): value is UserRole {
  return value === 'member' || value === 'admin';
}

function sanitizeUsers(raw: unknown): UserProfile[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set<string>();
  const cleanUsers: UserProfile[] = [];

  for (const value of raw) {
    if (!value || typeof value !== 'object') {
      continue;
    }

    const candidate = value as Partial<UserProfile>;
    if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string' || !isUserRole(candidate.role)) {
      continue;
    }

    if (seen.has(candidate.id)) {
      continue;
    }

    seen.add(candidate.id);
    cleanUsers.push({
      id: candidate.id,
      name: candidate.name,
      role: candidate.role
    });
  }

  return cleanUsers;
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

    const cleanDays: Record<string, AvailabilityStatus> = {};
    for (const [dateKey, statusValue] of Object.entries(userValue as Record<string, unknown>)) {
      if (isAvailabilityStatus(statusValue)) {
        cleanDays[dateKey] = statusValue;
      }
    }

    clean[userId] = cleanDays;
  }

  return clean;
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function createUserId(name: string): string {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24) || 'user';
  return `${slug}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadInitialState(): PersistedState {
  const fallback: PersistedState = {
    users: [],
    hostUserId: '',
    availability: {}
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    const users = sanitizeUsers(parsed.users);
    const validUserIds = new Set(users.map((user) => user.id));
    const hostUserId =
      typeof parsed.hostUserId === 'string' && validUserIds.has(parsed.hostUserId)
        ? parsed.hostUserId
        : users[0]?.id ?? '';

    return {
      users,
      hostUserId,
      availability: sanitizeAvailability(parsed.availability)
    };
  } catch {
    return fallback;
  }
}

function loadInitialSessionUserId(): string {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return typeof raw === 'string' ? raw : '';
  } catch {
    return '';
  }
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

function SignInPage({
  onSignIn,
  error
}: {
  onSignIn: (username: string, inviteCode: string) => void;
  error: string;
}) {
  const [username, setUsername] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  return (
    <section className="page-card sign-in-card">
      <h2>Join Scheduler</h2>
      <p>Enter your invite code and username to access the calendar.</p>

      <form
        className="sign-in-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSignIn(username, inviteCode);
        }}
      >
        <label htmlFor="username-input">
          Username
          <input
            id="username-input"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="off"
            maxLength={32}
            required
          />
        </label>

        <label htmlFor="invite-code-input">
          Invite Code
          <input
            id="invite-code-input"
            type="password"
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value)}
            autoComplete="off"
            required
          />
        </label>

        {error ? <p className="form-error">{error}</p> : null}

        <button type="submit" className="primary-button">
          Enter
        </button>
      </form>
    </section>
  );
}

function PersonalAvailabilityPage({
  currentUser,
  monthDates,
  monthValue,
  setMonthValue,
  paintStatus,
  setPaintStatus,
  getStatus,
  onStartPaint,
  onPaintWhileDragging,
  onPaintDate
}: {
  currentUser: UserProfile;
  monthDates: Date[];
  monthValue: string;
  setMonthValue: (value: string) => void;
  paintStatus: AvailabilityStatus;
  setPaintStatus: (status: AvailabilityStatus) => void;
  getStatus: (userId: string, dateKey: string) => AvailabilityStatus;
  onStartPaint: (dateKey: string) => void;
  onPaintWhileDragging: (dateKey: string) => void;
  onPaintDate: (dateKey: string) => void;
}) {
  const monthLabel = getMonthLabel(monthDates);
  const leadingEmptyCells = monthDates.length > 0 ? monthDates[0].getDay() : 0;
  const gridCells: Array<Date | null> = [...Array.from({ length: leadingEmptyCells }, () => null), ...monthDates];
  const trailingEmptyCells = (7 - (gridCells.length % 7)) % 7;
  gridCells.push(...Array.from({ length: trailingEmptyCells }, () => null));

  return (
    <section className="page-card">
      <h2>My Availability</h2>
      <p>You can only edit your own schedule. Choose a paint mode, then click and drag across days.</p>

      <div className="month-row">
        <h3 className="month-heading">{monthLabel}</h3>
        <label className="month-picker" htmlFor="month-picker">
          Month
          <input
            id="month-picker"
            type="month"
            value={monthValue}
            onChange={(event) => setMonthValue(event.target.value)}
          />
        </label>
      </div>

      <div className="paint-toolbar" role="toolbar" aria-label="Paint status">
        {PAINT_OPTIONS.map((option) => (
          <button
            key={option.status}
            type="button"
            className={`paint-button paint-${option.status} ${
              paintStatus === option.status ? 'paint-selected' : ''
            }`}
            onClick={() => setPaintStatus(option.status)}
          >
            {option.label}
          </button>
        ))}
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
          const status = getStatus(currentUser.id, dateKey);

          return (
            <button
              key={dateKey}
              type="button"
              className={`day-cell day-${status}`}
              role="gridcell"
              onMouseDown={() => onStartPaint(dateKey)}
              onMouseEnter={() => onPaintWhileDragging(dateKey)}
              onClick={() => onPaintDate(dateKey)}
              onDragStart={(event) => event.preventDefault()}
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
  currentUser,
  hostUserId,
  monthDateKeys,
  getStatus
}: {
  users: UserProfile[];
  currentUser: UserProfile;
  hostUserId: string;
  monthDateKeys: string[];
  getStatus: (userId: string, dateKey: string) => AvailabilityStatus;
}) {
  const canView = currentUser.role === 'admin' || currentUser.id === hostUserId;

  if (!canView) {
    return (
      <section className="page-card">
        <h2>Host Summary</h2>
        <p>This page is available only to the selected host and admin.</p>
      </section>
    );
  }

  const allGreenDates = monthDateKeys.filter(
    (dateKey) => users.length > 0 && users.every((user) => getStatus(user.id, dateKey) === 'available')
  );
  const anyRedDates = monthDateKeys.filter((dateKey) =>
    users.some((user) => getStatus(user.id, dateKey) === 'unavailable')
  );

  return (
    <section className="page-card">
      <h2>Host Summary</h2>
      <p>Month view for all signed-in users.</p>

      <div className="kpi-grid">
        <article>
          <h3>{users.length}</h3>
          <p>Total Signed-In Users</p>
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
        <h3>Best Candidate Dates</h3>
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

function AdminManagementPage({
  currentUser,
  users,
  hostUserId,
  setHostUserId
}: {
  currentUser: UserProfile;
  users: UserProfile[];
  hostUserId: string;
  setHostUserId: (userId: string) => void;
}) {
  if (currentUser.role !== 'admin') {
    return (
      <section className="page-card">
        <h2>Admin Management</h2>
        <p>Only admin can access this page.</p>
      </section>
    );
  }

  return (
    <section className="page-card">
      <h2>Admin Management</h2>
      <p>Signed-in users and host assignment.</p>

      <div className="admin-list">
        {users.length === 0 ? (
          <p className="empty-note">No users have signed in yet.</p>
        ) : (
          users.map((user) => (
            <label key={user.id} className="admin-row">
              <span>
                <strong>{user.name}</strong>
                <small>{user.role === 'admin' ? 'Admin' : 'Member'}</small>
              </span>
              <input
                type="radio"
                name="host-user"
                checked={hostUserId === user.id}
                onChange={() => setHostUserId(user.id)}
              />
            </label>
          ))
        )}
      </div>
    </section>
  );
}

export default function App() {
  const [state, setState] = useState<PersistedState>(() => loadInitialState());
  const [sessionUserId, setSessionUserId] = useState<string>(() => loadInitialSessionUserId());
  const [selectedMonth, setSelectedMonth] = useState<string>(() => toMonthValue(new Date()));
  const [selectedPaintStatus, setSelectedPaintStatus] = useState<AvailabilityStatus>('available');
  const [isPainting, setIsPainting] = useState(false);
  const [signInError, setSignInError] = useState('');

  const currentUser = state.users.find((user) => user.id === sessionUserId) ?? null;
  const hostUser = state.users.find((user) => user.id === state.hostUserId) ?? null;
  const monthDates = useMemo(() => getMonthDates(selectedMonth), [selectedMonth]);
  const monthDateKeys = useMemo(() => monthDates.map((date) => toDateKey(date)), [monthDates]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Keep UI functional if localStorage is unavailable.
    }
  }, [state]);

  useEffect(() => {
    try {
      if (sessionUserId) {
        localStorage.setItem(SESSION_KEY, sessionUserId);
      } else {
        localStorage.removeItem(SESSION_KEY);
      }
    } catch {
      // Keep UI functional if localStorage is unavailable.
    }
  }, [sessionUserId]);

  useEffect(() => {
    const onMouseUp = () => setIsPainting(false);
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, []);

  useEffect(() => {
    if (sessionUserId && !state.users.some((user) => user.id === sessionUserId)) {
      setSessionUserId('');
    }
  }, [sessionUserId, state.users]);

  const getStatus = (userId: string, dateKey: string): AvailabilityStatus => {
    return state.availability[userId]?.[dateKey] ?? 'unspecified';
  };

  const paintDate = (dateKey: string): void => {
    if (!currentUser) {
      return;
    }

    setState((current) => {
      const userDays = current.availability[currentUser.id] ?? {};
      if (userDays[dateKey] === selectedPaintStatus) {
        return current;
      }

      return {
        ...current,
        availability: {
          ...current.availability,
          [currentUser.id]: {
            ...userDays,
            [dateKey]: selectedPaintStatus
          }
        }
      };
    });
  };

  const onStartPaint = (dateKey: string): void => {
    setIsPainting(true);
    paintDate(dateKey);
  };

  const onPaintWhileDragging = (dateKey: string): void => {
    if (!isPainting) {
      return;
    }

    paintDate(dateKey);
  };

  const onSignIn = (usernameInput: string, inviteCodeInput: string): void => {
    const username = normalizeName(usernameInput);
    const inviteCode = inviteCodeInput.trim();

    if (!username) {
      setSignInError('Username is required.');
      return;
    }

    let role: UserRole | null = null;
    if (inviteCode === ADMIN_INVITE_CODE) {
      role = 'admin';
    } else if (inviteCode === MEMBER_INVITE_CODE) {
      role = 'member';
    }

    if (!role) {
      setSignInError('Invalid invite code.');
      return;
    }

    const existingUser = state.users.find((user) => user.name.toLowerCase() === username.toLowerCase());
    if (existingUser && existingUser.role !== role) {
      setSignInError('That username already exists with a different invite type.');
      return;
    }

    if (existingUser) {
      setSessionUserId(existingUser.id);
      setSignInError('');
      return;
    }

    const newUser: UserProfile = {
      id: createUserId(username),
      name: username,
      role
    };

    setState((current) => ({
      ...current,
      users: [...current.users, newUser],
      hostUserId: current.hostUserId || newUser.id
    }));
    setSessionUserId(newUser.id);
    setSignInError('');
  };

  const onSetHostUserId = (userId: string): void => {
    setState((current) => {
      if (!current.users.some((user) => user.id === userId)) {
        return current;
      }

      return {
        ...current,
        hostUserId: userId
      };
    });
  };

  const onSignOut = (): void => {
    setSessionUserId('');
    setSignInError('');
  };

  const onChangeMonth = (nextValue: string): void => {
    setSelectedMonth(isValidMonthValue(nextValue) ? nextValue : toMonthValue(new Date()));
  };

  if (!currentUser) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <h1>DnD Group Scheduler</h1>
          <p>Invite-only scheduling board for your party.</p>
        </header>
        <main>
          <SignInPage onSignIn={onSignIn} error={signInError} />
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>DnD Group Scheduler</h1>
        <p>
          Signed in as <strong>{currentUser.name}</strong> ({currentUser.role}). Host:{' '}
          <strong>{hostUser?.name ?? 'Not set'}</strong>
        </p>
        <button type="button" className="ghost-button sign-out-button" onClick={onSignOut}>
          Sign Out
        </button>
      </header>

      <nav className="top-nav" aria-label="Primary">
        <NavLink to="/" end>
          My Availability
        </NavLink>
        <NavLink to="/host">Host Summary</NavLink>
        {currentUser.role === 'admin' ? <NavLink to="/admin">Admin Management</NavLink> : null}
      </nav>

      <main>
        <Routes>
          <Route
            path="/"
            element={
              <PersonalAvailabilityPage
                currentUser={currentUser}
                monthDates={monthDates}
                monthValue={selectedMonth}
                setMonthValue={onChangeMonth}
                paintStatus={selectedPaintStatus}
                setPaintStatus={setSelectedPaintStatus}
                getStatus={getStatus}
                onStartPaint={onStartPaint}
                onPaintWhileDragging={onPaintWhileDragging}
                onPaintDate={paintDate}
              />
            }
          />
          <Route
            path="/host"
            element={
              <HostSummaryPage
                users={state.users}
                currentUser={currentUser}
                hostUserId={state.hostUserId}
                monthDateKeys={monthDateKeys}
                getStatus={getStatus}
              />
            }
          />
          <Route
            path="/admin"
            element={
              <AdminManagementPage
                currentUser={currentUser}
                users={state.users}
                hostUserId={state.hostUserId}
                setHostUserId={onSetHostUserId}
              />
            }
          />
          <Route
            path="*"
            element={
              <PersonalAvailabilityPage
                currentUser={currentUser}
                monthDates={monthDates}
                monthValue={selectedMonth}
                setMonthValue={onChangeMonth}
                paintStatus={selectedPaintStatus}
                setPaintStatus={setSelectedPaintStatus}
                getStatus={getStatus}
                onStartPaint={onStartPaint}
                onPaintWhileDragging={onPaintWhileDragging}
                onPaintDate={paintDate}
              />
            }
          />
        </Routes>
      </main>
    </div>
  );
}
