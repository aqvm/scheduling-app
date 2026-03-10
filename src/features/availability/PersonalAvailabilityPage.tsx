import { useEffect, useRef } from 'react';
import { PAINT_OPTIONS, WEEKDAY_LABELS } from '../../shared/scheduler/constants';
import { formatDateKey, getMonthLabel, toDateKey } from '../../shared/scheduler/date';
import { MonthNavigator } from '../../shared/scheduler/MonthNavigator';
import { getCompactStatusLabel, getStatusLabel } from '../../shared/scheduler/status';
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
   * Paint action used while dragging across day cells.
   */
  onPaintDate: (dateKey: string) => void;

  /**
   * Toggles a single day through all states for click-only interactions.
   */
  onToggleDate: (dateKey: string) => void;

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
  onPaintDate,
  onToggleDate,
  hasUnsavedChanges,
  isSaving,
  onSaveChanges
}: PersonalAvailabilityPageProps) {
  const monthLabel = getMonthLabel(monthDates);
  const paintInteractionRef = useRef<{
    startDateKey: string;
    didDrag: boolean;
    lastPaintedDateKey: string | null;
  } | null>(null);

  // Build a full rectangular calendar grid by adding null placeholders.
  const leadingEmptyCells = monthDates.length > 0 ? monthDates[0].getDay() : 0;
  const gridCells: Array<Date | null> = [...Array.from({ length: leadingEmptyCells }, () => null), ...monthDates];
  const trailingEmptyCells = (7 - (gridCells.length % 7)) % 7;
  gridCells.push(...Array.from({ length: trailingEmptyCells }, () => null));

  const todayDateKey = toDateKey(new Date());

  useEffect(() => {
    const onWindowMouseUp = () => {
      paintInteractionRef.current = null;
    };

    window.addEventListener('mouseup', onWindowMouseUp);
    return () => window.removeEventListener('mouseup', onWindowMouseUp);
  }, []);

  const onDayMouseDown = (dateKey: string): void => {
    paintInteractionRef.current = {
      startDateKey: dateKey,
      didDrag: false,
      lastPaintedDateKey: null
    };
  };

  const onDayMouseEnter = (dateKey: string): void => {
    const interaction = paintInteractionRef.current;
    if (!interaction) {
      return;
    }

    if (!interaction.didDrag && interaction.startDateKey === dateKey) {
      return;
    }

    if (!interaction.didDrag) {
      interaction.didDrag = true;
      interaction.lastPaintedDateKey = interaction.startDateKey;
      onPaintDate(interaction.startDateKey);
    }

    if (interaction.lastPaintedDateKey === dateKey) {
      return;
    }

    interaction.lastPaintedDateKey = dateKey;
    onPaintDate(dateKey);
  };

  const onDayMouseUp = (dateKey: string): void => {
    const interaction = paintInteractionRef.current;
    if (!interaction) {
      return;
    }

    if (!interaction.didDrag) {
      onToggleDate(dateKey);
      paintInteractionRef.current = null;
      return;
    }

    if (interaction.lastPaintedDateKey !== dateKey) {
      onPaintDate(dateKey);
    }

    paintInteractionRef.current = null;
  };

  return (
    <section className="page-card">
      <h2>My Availability</h2>
      <p>Click a day to toggle states, or choose a paint mode and drag across days.</p>

      <div className="month-row">
        <h3 className="month-heading">{monthLabel}</h3>
        <MonthNavigator
          monthValue={monthValue}
          onChangeMonth={setMonthValue}
          ariaLabel="My availability month navigation"
        />
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
              onMouseDown={() => onDayMouseDown(dateKey)}
              onMouseEnter={() => onDayMouseEnter(dateKey)}
              onMouseUp={() => onDayMouseUp(dateKey)}
              onClick={(event) => {
                if (event.detail === 0) {
                  onToggleDate(dateKey);
                }
              }}
              onDragStart={(event) => event.preventDefault()}
              aria-label={`${formatDateKey(dateKey)}: ${getStatusLabel(status)}${isPastDate ? ' (past date, locked)' : isToday ? ' (today)' : ''}`}
              disabled={isPastDate}
            >
              <span className="day-number">{date.getDate()}</span>
              <span className="day-status">
                <span className="status-long">{getStatusLabel(status)}</span>
                <span className="status-short" aria-hidden="true">
                  {getCompactStatusLabel(status)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

