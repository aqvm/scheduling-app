import { MONTH_NAME_OPTIONS, PAINT_OPTIONS, WEEKDAY_LABELS } from '../../shared/scheduler/constants';
import { formatDateKey, getMonthLabel, padTwo, parseMonthValue, toDateKey } from '../../shared/scheduler/date';
import { getStatusLabel } from '../../shared/scheduler/status';
import type { AvailabilityStatus, UserProfile } from '../../shared/scheduler/types';

/**
 * Props needed by the personal availability editor.
 */
type PersonalAvailabilityPageProps = {
  /**
   * The signed-in user whose own calendar is editable.
   */
  currentUser: UserProfile;

  /**
   * All dates in the currently selected month.
   */
  monthDates: Date[];

  /**
   * Month selector state in `YYYY-MM` form.
   */
  monthValue: string;

  /**
   * Updates month selector state.
   */
  setMonthValue: (value: string) => void;

  /**
   * Current paint mode selected in the toolbar.
   */
  paintStatus: AvailabilityStatus;

  /**
   * Changes paint mode.
   */
  setPaintStatus: (status: AvailabilityStatus) => void;

  /**
   * Resolves the effective status for a user/day, including unsaved edits.
   */
  getStatus: (userId: string, dateKey: string) => AvailabilityStatus;

  /**
   * Mouse-down handler that starts drag painting.
   */
  onStartPaint: (dateKey: string) => void;

  /**
   * Mouse-enter handler used while drag painting is active.
   */
  onPaintWhileDragging: (dateKey: string) => void;

  /**
   * Single-cell click paint action.
   */
  onPaintDate: (dateKey: string) => void;

  /**
   * Whether there are local edits not yet persisted.
   */
  hasUnsavedChanges: boolean;

  /**
   * Indicates an in-flight save request.
   */
  isSaving: boolean;

  /**
   * Persists pending edits to Firestore.
   */
  onSaveChanges: () => void;
};

/**
 * Calendar editing view where users manage their own availability.
 */
export function PersonalAvailabilityPage({
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
}: PersonalAvailabilityPageProps) {
  const monthLabel = getMonthLabel(monthDates);
  const selectedMonthParts = parseMonthValue(monthValue);
  const yearOptions = Array.from({ length: 11 }, (_, index) => selectedMonthParts.year - 5 + index);

  // Build a full rectangular calendar grid by adding null placeholders.
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

          // Lexicographic compare works because keys are fixed-width `YYYY-MM-DD`.
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
