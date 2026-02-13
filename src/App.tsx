import { NavLink, Route, Routes } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  limit
} from 'firebase/firestore';
import { auth, db, firebaseConfigError } from './firebase';

type AvailabilityStatus = 'unspecified' | 'available' | 'maybe' | 'unavailable';
type UserRole = 'member' | 'admin';

type UserProfile = {
  id: string;
  name: string;
  role: UserRole;
  email: string;
};

type CampaignInvite = {
  code: string;
  campaignId: string;
  role: UserRole;
  createdByUid: string;
  redeemedByUid: string;
  revoked: boolean;
};

type AvailabilityByUser = Record<string, Record<string, AvailabilityStatus>>;

type PersistedState = {
  users: UserProfile[];
  hostUserId: string;
  availability: AvailabilityByUser;
};
type PendingEditsByUser = Record<string, Record<string, AvailabilityStatus>>;

const INITIAL_PERSISTED_STATE: PersistedState = {
  users: [],
  hostUserId: '',
  availability: {}
};

type DateScoreSummary = {
  dateKey: string;
  availableCount: number;
  maybeCount: number;
  unavailableCount: number;
  unspecifiedCount: number;
  score: number;
};

const LEGACY_MEMBER_INVITE_CODE = import.meta.env.VITE_MEMBER_INVITE_CODE ?? 'party-members';
const LEGACY_ADMIN_INVITE_CODE = import.meta.env.VITE_ADMIN_INVITE_CODE ?? 'owner-admin';
const APP_NAMESPACE = import.meta.env.VITE_FIREBASE_APP_NAMESPACE ?? 'default';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PAINT_OPTIONS: Array<{ status: AvailabilityStatus; label: string }> = [
  { status: 'available', label: 'Available' },
  { status: 'maybe', label: 'Maybe' },
  { status: 'unavailable', label: 'Unavailable' },
  { status: 'unspecified', label: 'Clear' }
];
const MONTH_NAME_OPTIONS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
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

function parseMonthValue(value: string): { year: number; month: number } {
  if (!isValidMonthValue(value)) {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() + 1 };
  }

  const [yearPart, monthPart] = value.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() + 1 };
  }

  return { year, month };
}

function getMonthDates(monthValue: string): Date[] {
  const { year, month } = parseMonthValue(monthValue);

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

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function normalizeInviteCode(value: string): string {
  return value.trim().toLowerCase();
}

function createInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segments = [4, 4, 4];
  const chars: string[] = [];

  segments.forEach((segmentLength, segmentIndex) => {
    for (let index = 0; index < segmentLength; index += 1) {
      const randomIndex = Math.floor(Math.random() * alphabet.length);
      chars.push(alphabet[randomIndex]);
    }

    if (segmentIndex < segments.length - 1) {
      chars.push('-');
    }
  });

  return chars.join('');
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

function getStatusScore(status: AvailabilityStatus): number {
  if (status === 'available') {
    return 2;
  }

  if (status === 'maybe') {
    return 1;
  }

  if (status === 'unavailable') {
    return -2;
  }

  return 0;
}

function getAppDocumentRef() {
  if (!db) {
    return null;
  }

  return doc(db, 'apps', APP_NAMESPACE);
}

function getUsersCollectionRef() {
  const appRef = getAppDocumentRef();
  return appRef ? collection(appRef, 'users') : null;
}

function getAvailabilityCollectionRef() {
  const appRef = getAppDocumentRef();
  return appRef ? collection(appRef, 'availability') : null;
}

function getSettingsDocumentRef() {
  const appRef = getAppDocumentRef();
  return appRef ? doc(appRef, 'meta', 'settings') : null;
}

function getCampaignInvitesCollectionRef() {
  const appRef = getAppDocumentRef();
  return appRef ? collection(appRef, 'campaignInvites') : null;
}

function SignInPage({
  authUserId,
  onGoogleSignIn,
  isGoogleSigningIn,
  onSignIn,
  error
}: {
  authUserId: string;
  onGoogleSignIn: () => void;
  isGoogleSigningIn: boolean;
  onSignIn: (username: string, inviteCode: string) => void;
  error: string;
}) {
  const [username, setUsername] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const hasGoogleSession = authUserId.length > 0;

  return (
    <section className="page-card sign-in-card">
      <h2>Join Scheduler</h2>
      <p>
        {hasGoogleSession
          ? 'Google account connected. Enter your invite code and username to access the calendar.'
          : 'Sign in with Google first, then enter your invite code and username.'}
      </p>

      {hasGoogleSession ? (
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

          <button type="submit" className="primary-button">
            Enter
          </button>
        </form>
      ) : (
        <button type="button" className="primary-button google-button" onClick={onGoogleSignIn} disabled={isGoogleSigningIn}>
          {isGoogleSigningIn ? 'Connecting...' : 'Continue with Google'}
        </button>
      )}

      {error ? <p className="form-error">{error}</p> : null}
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
  onPaintDate,
  hasUnsavedChanges,
  isSaving,
  onSaveChanges
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
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  onSaveChanges: () => void;
}) {
  const monthLabel = getMonthLabel(monthDates);
  const selectedMonthParts = parseMonthValue(monthValue);
  const yearOptions = Array.from({ length: 11 }, (_, index) => selectedMonthParts.year - 5 + index);
  const leadingEmptyCells = monthDates.length > 0 ? monthDates[0].getDay() : 0;
  const gridCells: Array<Date | null> = [...Array.from({ length: leadingEmptyCells }, () => null), ...monthDates];
  const trailingEmptyCells = (7 - (gridCells.length % 7)) % 7;
  gridCells.push(...Array.from({ length: trailingEmptyCells }, () => null));
  const todayDateKey = toDateKey(new Date());

  return (
    <section className="page-card">
      <h2>My Availability</h2>
      <p>You can only edit your own schedule. Choose a paint mode, then click and drag across days.</p>

      <div className="month-row">
        <h3 className="month-heading">{monthLabel}</h3>
        <div className="month-picker-group" aria-label="Month picker">
          <label className="month-picker" htmlFor="month-name-select">
            Month
            <select
              id="month-name-select"
              value={String(selectedMonthParts.month)}
              onChange={(event) =>
                setMonthValue(`${selectedMonthParts.year}-${padTwo(Number(event.target.value))}`)
              }
            >
              {MONTH_NAME_OPTIONS.map((label, index) => (
                <option key={label} value={String(index + 1)}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="month-picker" htmlFor="month-year-select">
            Year
            <select
              id="month-year-select"
              value={String(selectedMonthParts.year)}
              onChange={(event) =>
                setMonthValue(`${event.target.value}-${padTwo(selectedMonthParts.month)}`)
              }
            >
              {yearOptions.map((year) => (
                <option key={year} value={String(year)}>
                  {year}
                </option>
              ))}
            </select>
          </label>
        </div>
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

      <div className="save-row">
        <button
          type="button"
          className="primary-button"
          onClick={onSaveChanges}
          disabled={!hasUnsavedChanges || isSaving}
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
        <span className="save-note">{hasUnsavedChanges ? 'Unsaved changes' : 'All changes saved'}</span>
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
          const isPastDate = dateKey < todayDateKey;
          const isToday = dateKey === todayDateKey;

          return (
            <button
              key={dateKey}
              type="button"
              className={`day-cell day-${status} ${isPastDate ? 'day-past' : ''} ${isToday ? 'day-today' : ''}`.trim()}
              role="gridcell"
              onMouseDown={() => {
                if (!isPastDate) {
                  onStartPaint(dateKey);
                }
              }}
              onMouseEnter={() => {
                if (!isPastDate) {
                  onPaintWhileDragging(dateKey);
                }
              }}
              onClick={() => {
                if (!isPastDate) {
                  onPaintDate(dateKey);
                }
              }}
              onDragStart={(event) => event.preventDefault()}
              aria-label={`${formatDateKey(dateKey)}: ${getStatusLabel(status)}${isPastDate ? ' (past date, locked)' : isToday ? ' (today)' : ''}`}
              disabled={isPastDate}
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
  const rankedDateSummaries = useMemo(() => {
    const dateSummaries: DateScoreSummary[] = monthDateKeys.map((dateKey) => {
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
  }, [monthDateKeys, users, getStatus]);
  const topCandidateDates = rankedDateSummaries.slice(0, 5);

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
                  Available {dateSummary.availableCount} · Maybe {dateSummary.maybeCount} · Unavailable{' '}
                  {dateSummary.unavailableCount}
                </span>
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
      </section>
    </section>
  );
}

function AdminManagementPage({
  currentUser,
  campaignId,
  users,
  hostUserId,
  setHostUserId,
  invites,
  latestInviteCode,
  inviteError,
  isCreatingInvite,
  onCreateInvite,
  onRevokeInvite
}: {
  currentUser: UserProfile;
  campaignId: string;
  users: UserProfile[];
  hostUserId: string;
  setHostUserId: (userId: string) => void;
  invites: CampaignInvite[];
  latestInviteCode: string;
  inviteError: string;
  isCreatingInvite: boolean;
  onCreateInvite: (role: UserRole) => void;
  onRevokeInvite: (code: string) => void;
}) {
  const [newInviteRole, setNewInviteRole] = useState<UserRole>('member');

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
      <p>Campaign {campaignId} invites, users, and host assignment.</p>

      <section className="summary-block">
        <h3>Campaign Invites</h3>
        <div className="invite-create-row">
          <label className="month-picker" htmlFor="invite-role-select">
            Role
            <select
              id="invite-role-select"
              value={newInviteRole}
              onChange={(event) => setNewInviteRole(event.target.value === 'admin' ? 'admin' : 'member')}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <button
            type="button"
            className="primary-button"
            onClick={() => onCreateInvite(newInviteRole)}
            disabled={isCreatingInvite}
          >
            {isCreatingInvite ? 'Creating...' : 'Create Invite Code'}
          </button>
        </div>
        {latestInviteCode ? (
          <p>
            Latest invite: <code>{latestInviteCode}</code>
          </p>
        ) : null}
        {inviteError ? <p className="form-error">{inviteError}</p> : null}

        <div className="admin-list">
          {invites.length === 0 ? (
            <p className="empty-note">No invite codes created yet.</p>
          ) : (
            invites.map((invite) => (
              <div key={invite.code} className="admin-row">
                <span>
                  <strong>{invite.code.toUpperCase()}</strong>
                  <small>{invite.role === 'admin' ? 'Admin Invite' : 'Member Invite'}</small>
                  <small>
                    {invite.revoked
                      ? 'Revoked'
                      : invite.redeemedByUid
                        ? `Redeemed by ${invite.redeemedByUid}`
                        : 'Active'}
                  </small>
                </span>
                {!invite.revoked && !invite.redeemedByUid ? (
                  <button type="button" className="ghost-button" onClick={() => onRevokeInvite(invite.code)}>
                    Revoke
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="summary-block">
        <h3>Host Assignment</h3>
      <div className="admin-list">
        {users.length === 0 ? (
          <p className="empty-note">No users have signed in yet.</p>
        ) : (
          users.map((user) => (
            <label key={user.id} className="admin-row">
              <span>
                <strong>{user.name}</strong>
                <small>{user.email || 'No email on file yet'}</small>
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
    </section>
  );
}

export default function App() {
  const [state, setState] = useState<PersistedState>(INITIAL_PERSISTED_STATE);
  const [pendingEdits, setPendingEdits] = useState<PendingEditsByUser>({});
  const [authUserId, setAuthUserId] = useState('');
  const [sessionUserId, setSessionUserId] = useState('');
  const [authReady, setAuthReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => toMonthValue(new Date()));
  const [selectedPaintStatus, setSelectedPaintStatus] = useState<AvailabilityStatus>('available');
  const [isSavingChanges, setIsSavingChanges] = useState(false);
  const [isPainting, setIsPainting] = useState(false);
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [invites, setInvites] = useState<CampaignInvite[]>([]);
  const [latestInviteCode, setLatestInviteCode] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [signInError, setSignInError] = useState('');
  const [appError, setAppError] = useState('');

  const currentUser = state.users.find((user) => user.id === sessionUserId) ?? null;
  const hostUser = state.users.find((user) => user.id === state.hostUserId) ?? null;
  const canViewHostSummary =
    currentUser !== null && (currentUser.role === 'admin' || currentUser.id === state.hostUserId);
  const currentUserPendingEdits = currentUser ? pendingEdits[currentUser.id] ?? {} : {};
  const hasUnsavedChanges = Object.keys(currentUserPendingEdits).length > 0;
  const monthDates = useMemo(() => getMonthDates(selectedMonth), [selectedMonth]);
  const monthDateKeys = useMemo(() => monthDates.map((date) => toDateKey(date)), [monthDates]);

  useEffect(() => {
    if (!auth) {
      setAuthReady(true);
      return;
    }

    const authInstance = auth;
    const unsubscribe = onAuthStateChanged(authInstance, (user) => {
      if (user) {
        setAuthUserId(user.uid);
        setAuthReady(true);
        return;
      }

      setAuthUserId('');
      setSessionUserId('');
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!db || !authReady) {
      if (!db) {
        setDataReady(true);
      }

      return;
    }

    if (!authUserId) {
      setState(INITIAL_PERSISTED_STATE);
      setDataReady(true);
      return;
    }

    const usersRef = getUsersCollectionRef();
    const availabilityRef = getAvailabilityCollectionRef();
    const settingsRef = getSettingsDocumentRef();

    if (!usersRef || !availabilityRef || !settingsRef) {
      setDataReady(true);
      return;
    }

    setDataReady(false);

    let usersLoaded = false;
    let availabilityLoaded = false;
    let settingsLoaded = false;

    const maybeMarkReady = (): void => {
      if (usersLoaded && availabilityLoaded && settingsLoaded) {
        setDataReady(true);
      }
    };

    const unsubscribeUsers = onSnapshot(
      usersRef,
      (snapshot) => {
        const users: UserProfile[] = [];

        snapshot.forEach((docSnapshot) => {
          const value = docSnapshot.data();
          const name = typeof value.name === 'string' ? normalizeName(value.name) : '';
          const email = typeof value.email === 'string' ? value.email.trim().toLowerCase() : '';
          const role = value.role;

          if (!name || !isUserRole(role)) {
            return;
          }

          users.push({
            id: docSnapshot.id,
            name,
            role,
            email
          });
        });

        setState((current) => ({
          ...current,
          users: users.sort((a, b) => a.name.localeCompare(b.name))
        }));
        usersLoaded = true;
        maybeMarkReady();
      },
      () => {
        usersLoaded = true;
        maybeMarkReady();
      }
    );

    const unsubscribeAvailability = onSnapshot(
      availabilityRef,
      (snapshot) => {
        const availability: AvailabilityByUser = {};

        snapshot.forEach((docSnapshot) => {
          const raw = docSnapshot.data();
          const daysRaw = raw.days;

          if (!daysRaw || typeof daysRaw !== 'object') {
            availability[docSnapshot.id] = {};
            return;
          }

          const days: Record<string, AvailabilityStatus> = {};
          for (const [dateKey, statusValue] of Object.entries(daysRaw as Record<string, unknown>)) {
            if (isAvailabilityStatus(statusValue)) {
              days[dateKey] = statusValue;
            }
          }

          availability[docSnapshot.id] = days;
        });

        setState((current) => ({
          ...current,
          availability
        }));
        availabilityLoaded = true;
        maybeMarkReady();
      },
      () => {
        availabilityLoaded = true;
        maybeMarkReady();
      }
    );

    const unsubscribeSettings = onSnapshot(
      settingsRef,
      (docSnapshot) => {
        const value = docSnapshot.data();
        const hostUserId = typeof value?.hostUserId === 'string' ? value.hostUserId : '';

        setState((current) => ({
          ...current,
          hostUserId
        }));
        settingsLoaded = true;
        maybeMarkReady();
      },
      () => {
        settingsLoaded = true;
        maybeMarkReady();
      }
    );

    return () => {
      unsubscribeUsers();
      unsubscribeAvailability();
      unsubscribeSettings();
    };
  }, [authReady, authUserId]);

  useEffect(() => {
    if (!authUserId) {
      setSessionUserId('');
      return;
    }

    if (state.users.some((user) => user.id === authUserId)) {
      setSessionUserId(authUserId);
    }
  }, [authUserId, state.users]);

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'admin') {
      setInvites([]);
      return;
    }

    const invitesRef = getCampaignInvitesCollectionRef();
    if (!invitesRef) {
      setInvites([]);
      return;
    }

    const invitesQuery = query(invitesRef, where('campaignId', '==', APP_NAMESPACE), limit(100));
    const unsubscribe = onSnapshot(
      invitesQuery,
      (snapshot) => {
        const nextInvites: CampaignInvite[] = [];

        snapshot.forEach((docSnapshot) => {
          const value = docSnapshot.data();
          const campaignId = typeof value.campaignId === 'string' ? value.campaignId : '';
          const role = value.role;
          const createdByUid = typeof value.createdByUid === 'string' ? value.createdByUid : '';
          const redeemedByUid = typeof value.redeemedByUid === 'string' ? value.redeemedByUid : '';
          const revoked = value.revoked === true;

          if (!campaignId || !createdByUid || !isUserRole(role)) {
            return;
          }

          nextInvites.push({
            code: docSnapshot.id,
            campaignId,
            role,
            createdByUid,
            redeemedByUid,
            revoked
          });
        });

        nextInvites.sort((left, right) => right.code.localeCompare(left.code));
        setInvites(nextInvites);
      },
      () => {
        setInvites([]);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    const onMouseUp = () => setIsPainting(false);
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, []);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    const userId = currentUser.id;
    const userPending = pendingEdits[userId];
    if (!userPending || Object.keys(userPending).length === 0) {
      return;
    }

    const userServerDays = state.availability[userId] ?? {};
    const nextPending: Record<string, AvailabilityStatus> = {};

    for (const [dateKey, status] of Object.entries(userPending)) {
      const serverStatus = userServerDays[dateKey] ?? 'unspecified';
      if (serverStatus !== status) {
        nextPending[dateKey] = status;
      }
    }

    const pendingEntries = Object.entries(userPending);
    const nextEntries = Object.entries(nextPending);
    const isEqual =
      pendingEntries.length === nextEntries.length &&
      pendingEntries.every(([dateKey, status]) => nextPending[dateKey] === status);

    if (isEqual) {
      return;
    }

    setPendingEdits((current) => {
      if (Object.keys(nextPending).length === 0) {
        const { [userId]: _removed, ...rest } = current;
        return rest;
      }

      return {
        ...current,
        [userId]: nextPending
      };
    });
  }, [currentUser, pendingEdits, state.availability]);

  useEffect(() => {
    const settingsRef = getSettingsDocumentRef();
    if (!settingsRef || state.users.length === 0 || state.hostUserId) {
      return;
    }

    void setDoc(settingsRef, { hostUserId: state.users[0].id, updatedAt: serverTimestamp() }, { merge: true });
  }, [state.users, state.hostUserId]);

  const getStatus = (userId: string, dateKey: string): AvailabilityStatus => {
    const pendingStatus = pendingEdits[userId]?.[dateKey];
    if (pendingStatus) {
      return pendingStatus;
    }

    return state.availability[userId]?.[dateKey] ?? 'unspecified';
  };

  const paintDate = (dateKey: string): void => {
    if (!currentUser) {
      return;
    }

    const currentUserId = currentUser.id;
    const serverStatus = state.availability[currentUserId]?.[dateKey] ?? 'unspecified';
    const nextStatus = selectedPaintStatus;

    setPendingEdits((current) => {
      const userPending = current[currentUserId] ?? {};
      const nextPending = { ...userPending };

      if (nextStatus === serverStatus) {
        delete nextPending[dateKey];
      } else {
        nextPending[dateKey] = nextStatus;
      }

      if (Object.keys(nextPending).length === 0) {
        const { [currentUserId]: _removed, ...rest } = current;
        return rest;
      }

      return {
        ...current,
        [currentUserId]: nextPending
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

  const onSaveChanges = (): void => {
    if (!currentUser || isSavingChanges) {
      return;
    }

    const userPendingEdits = pendingEdits[currentUser.id];
    if (!userPendingEdits || Object.keys(userPendingEdits).length === 0) {
      return;
    }

    const availabilityRef = getAvailabilityCollectionRef();
    if (!availabilityRef) {
      setAppError('Firebase is not configured.');
      return;
    }

    const nextDays = {
      ...(state.availability[currentUser.id] ?? {}),
      ...userPendingEdits
    };

    setIsSavingChanges(true);
    setAppError('');

    void setDoc(
      doc(availabilityRef, currentUser.id),
      {
        days: nextDays,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    )
      .then(() => {
        setPendingEdits((current) => {
          const { [currentUser.id]: _removed, ...rest } = current;
          return rest;
        });
      })
      .catch(() => {
        setAppError('Unable to save availability changes.');
      })
      .finally(() => {
        setIsSavingChanges(false);
      });
  };

  const onSignIn = (usernameInput: string, inviteCodeInput: string): void => {
    const username = normalizeName(usernameInput);
    const inviteCode = normalizeInviteCode(inviteCodeInput);
    const signedInEmail = auth?.currentUser?.email?.trim().toLowerCase() ?? '';

    if (!username) {
      setSignInError('Username is required.');
      return;
    }

    if (!authUserId) {
      setSignInError('Sign in with Google first.');
      return;
    }

    if (!signedInEmail) {
      setSignInError('Unable to confirm your Google account email.');
      return;
    }

    if (!db) {
      setSignInError('Firebase is not configured.');
      return;
    }

    const usersRef = getUsersCollectionRef();
    const settingsRef = getSettingsDocumentRef();
    const invitesRef = getCampaignInvitesCollectionRef();
    if (!usersRef || !settingsRef || !invitesRef) {
      setSignInError('Firebase is not configured.');
      return;
    }

    const userDocRef = doc(usersRef, authUserId);
    const inviteDocRef = doc(invitesRef, inviteCode);

    void runTransaction(db, async (transaction) => {
      const inviteSnapshot = await transaction.get(inviteDocRef);
      let inviteRole: UserRole | null = null;
      let shouldRedeemInvite = false;

      if (inviteSnapshot.exists()) {
        const inviteValue = inviteSnapshot.data();
        const campaignId = typeof inviteValue.campaignId === 'string' ? inviteValue.campaignId : '';
        const inviteRoleValue = inviteValue.role;
        const redeemedByUid = typeof inviteValue.redeemedByUid === 'string' ? inviteValue.redeemedByUid : '';
        const revoked = inviteValue.revoked === true;

        if (!campaignId || campaignId !== APP_NAMESPACE) {
          throw new Error('This invite code is for a different campaign.');
        }

        if (!isUserRole(inviteRoleValue)) {
          throw new Error('Invite code role is invalid.');
        }

        if (revoked) {
          throw new Error('This invite code has been revoked.');
        }

        if (redeemedByUid && redeemedByUid !== authUserId) {
          throw new Error('This invite code has already been used.');
        }

        inviteRole = inviteRoleValue;
        shouldRedeemInvite = !redeemedByUid;
      } else {
        // Bootstrap fallback for environments still using static invite codes.
        if (inviteCode === normalizeInviteCode(LEGACY_ADMIN_INVITE_CODE)) {
          inviteRole = 'admin';
        } else if (inviteCode === normalizeInviteCode(LEGACY_MEMBER_INVITE_CODE)) {
          inviteRole = 'member';
        }
      }

      if (!inviteRole) {
        throw new Error('Invalid invite code.');
      }

      const userSnapshot = await transaction.get(userDocRef);
      if (userSnapshot.exists()) {
        const existingRole = userSnapshot.data().role;
        if (!isUserRole(existingRole)) {
          throw new Error('Profile role is invalid.');
        }

        if (existingRole !== inviteRole) {
          throw new Error('This Google profile is already registered with a different invite type.');
        }

        transaction.set(
          userDocRef,
          {
            name: username,
            email: signedInEmail,
            role: existingRole,
            lastSeenAt: serverTimestamp()
          },
          { merge: true }
        );
      } else {
        transaction.set(
          userDocRef,
          {
            name: username,
            email: signedInEmail,
            role: inviteRole,
            createdAt: serverTimestamp(),
            lastSeenAt: serverTimestamp()
          },
          { merge: true }
        );
      }

      if (!state.hostUserId) {
        transaction.set(settingsRef, { hostUserId: authUserId, updatedAt: serverTimestamp() }, { merge: true });
      }

      if (shouldRedeemInvite) {
        transaction.update(inviteDocRef, {
          redeemedByUid: authUserId
        });
      }
    })
      .then(() => {
        setSessionUserId(authUserId);
        setSignInError('');
        setAppError('');
      })
      .catch((error: unknown) => {
        if (error instanceof Error) {
          setSignInError(error.message);
          return;
        }

        setSignInError('Unable to sign in at this time.');
      });
  };

  const onGoogleSignIn = (): void => {
    if (!auth || isGoogleSigningIn) {
      return;
    }

    setIsGoogleSigningIn(true);
    setSignInError('');

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    void signInWithPopup(auth, provider)
      .catch(() => {
        setSignInError('Unable to sign in with Google right now.');
      })
      .finally(() => {
        setIsGoogleSigningIn(false);
      });
  };

  const onCreateInvite = (role: UserRole): void => {
    if (!currentUser || currentUser.role !== 'admin') {
      return;
    }

    const invitesRef = getCampaignInvitesCollectionRef();
    if (!invitesRef) {
      setInviteError('Firebase is not configured.');
      return;
    }

    const inviteCode = createInviteCode();
    const inviteCodeId = normalizeInviteCode(inviteCode);

    setInviteError('');
    setIsCreatingInvite(true);

    void setDoc(doc(invitesRef, inviteCodeId), {
      campaignId: APP_NAMESPACE,
      role,
      createdByUid: currentUser.id,
      createdAt: serverTimestamp(),
      revoked: false,
      redeemedByUid: ''
    })
      .then(() => {
        setLatestInviteCode(inviteCode);
      })
      .catch(() => {
        setInviteError('Unable to create invite code.');
      })
      .finally(() => {
        setIsCreatingInvite(false);
      });
  };

  const onRevokeInvite = (code: string): void => {
    if (!currentUser || currentUser.role !== 'admin') {
      return;
    }

    const invitesRef = getCampaignInvitesCollectionRef();
    if (!invitesRef) {
      setInviteError('Firebase is not configured.');
      return;
    }

    setInviteError('');
    void setDoc(
      doc(invitesRef, code),
      {
        revoked: true
      },
      { merge: true }
    ).catch(() => {
      setInviteError('Unable to revoke invite code.');
    });
  };

  const onSetHostUserId = (userId: string): void => {
    if (!currentUser || currentUser.role !== 'admin') {
      return;
    }

    const settingsRef = getSettingsDocumentRef();
    if (!settingsRef || !state.users.some((user) => user.id === userId)) {
      return;
    }

    setState((current) => ({
      ...current,
      hostUserId: userId
    }));

    void setDoc(settingsRef, { hostUserId: userId, updatedAt: serverTimestamp() }, { merge: true }).catch(() => {
      setAppError('Unable to update host assignment.');
    });
  };

  const onSignOut = (): void => {
    setState(INITIAL_PERSISTED_STATE);
    setSessionUserId('');
    setInvites([]);
    setLatestInviteCode('');
    setInviteError('');
    setSignInError('');
    setAppError('');
    setIsPainting(false);
    setPendingEdits({});
    setIsSavingChanges(false);

    if (!auth) {
      return;
    }

    void signOut(auth).catch(() => {
      setAppError('Unable to sign out cleanly.');
    });
  };

  const onChangeMonth = (nextValue: string): void => {
    setSelectedMonth(isValidMonthValue(nextValue) ? nextValue : toMonthValue(new Date()));
  };

  if (firebaseConfigError) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <h1>DnD Group Scheduler</h1>
          <p>Firebase setup is required for shared state.</p>
        </header>
        <main>
          {/* Keep a single <main> wrapper for the config error state. */}
          <section className="page-card sign-in-card">
            <h2>Missing Firebase Config</h2>
            <p>{firebaseConfigError}</p>
          </section>
        </main>
      </div>
    );
  }

  if (!authReady || !dataReady) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <h1>DnD Group Scheduler</h1>
          <p>Connecting to shared schedule data...</p>
        </header>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <h1>DnD Group Scheduler</h1>
          <p>Invite-only scheduling board for your party.</p>
        </header>
        <main>
          <SignInPage
            authUserId={authUserId}
            onGoogleSignIn={onGoogleSignIn}
            isGoogleSigningIn={isGoogleSigningIn}
            onSignIn={onSignIn}
            error={signInError}
          />
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
        {appError ? <p className="form-error">{appError}</p> : null}
      </header>

      <nav className="top-nav" aria-label="Primary">
        <NavLink to="/" end>
          My Availability
        </NavLink>
        {canViewHostSummary ? <NavLink to="/host">Host Summary</NavLink> : null}
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
                hasUnsavedChanges={hasUnsavedChanges}
                isSaving={isSavingChanges}
                onSaveChanges={onSaveChanges}
              />
            }
          />
          <Route
            path="/host"
            element={
              canViewHostSummary ? (
                <HostSummaryPage
                  users={state.users}
                  currentUser={currentUser}
                  hostUserId={state.hostUserId}
                  monthDateKeys={monthDateKeys}
                  getStatus={getStatus}
                />
              ) : (
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
                  hasUnsavedChanges={hasUnsavedChanges}
                  isSaving={isSavingChanges}
                  onSaveChanges={onSaveChanges}
                />
              )
            }
          />
          <Route
            path="/admin"
            element={
              <AdminManagementPage
                currentUser={currentUser}
                campaignId={APP_NAMESPACE}
                users={state.users}
                hostUserId={state.hostUserId}
                setHostUserId={onSetHostUserId}
                invites={invites}
                latestInviteCode={latestInviteCode}
                inviteError={inviteError}
                isCreatingInvite={isCreatingInvite}
                onCreateInvite={onCreateInvite}
                onRevokeInvite={onRevokeInvite}
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
                hasUnsavedChanges={hasUnsavedChanges}
                isSaving={isSavingChanges}
                onSaveChanges={onSaveChanges}
              />
            }
          />
        </Routes>
      </main>
    </div>
  );
}
