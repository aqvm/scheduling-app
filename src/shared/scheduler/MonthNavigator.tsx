import { useEffect, useRef, useState } from 'react';
import { MONTH_NAME_OPTIONS } from './constants';
import { padTwo, parseMonthValue, shiftMonthValue } from './date';

/**
 * Shared month navigator with previous/next buttons and a button-grid month picker.
 */
type MonthNavigatorProps = {
  monthValue: string;
  onChangeMonth: (value: string) => void;
  ariaLabel: string;
};

export function MonthNavigator({ monthValue, onChangeMonth, ariaLabel }: MonthNavigatorProps) {
  const selectedMonthParts = parseMonthValue(monthValue);
  const [pickerYear, setPickerYear] = useState(selectedMonthParts.year);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const pickerDialogLabelId = `${ariaLabel.replace(/\s+/g, '-').toLowerCase()}-picker-label`;

  useEffect(() => {
    setPickerYear(selectedMonthParts.year);
  }, [selectedMonthParts.year]);

  useEffect(() => {
    if (!isPickerOpen) {
      return;
    }

    const onWindowMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!target || !(target instanceof Node)) {
        return;
      }

      if (!popoverRef.current?.contains(target)) {
        setIsPickerOpen(false);
      }
    };

    window.addEventListener('mousedown', onWindowMouseDown);
    return () => window.removeEventListener('mousedown', onWindowMouseDown);
  }, [isPickerOpen]);

  const monthLabel = `${MONTH_NAME_OPTIONS[selectedMonthParts.month - 1]} ${selectedMonthParts.year}`;

  const onSelectMonth = (month: number): void => {
    onChangeMonth(`${pickerYear}-${padTwo(month)}`);
    setIsPickerOpen(false);
  };

  return (
    <div className="month-nav" role="group" aria-label={ariaLabel}>
      <button
        type="button"
        className="ghost-button month-step-button"
        onClick={() => onChangeMonth(shiftMonthValue(monthValue, -1))}
        aria-label="Previous month"
      >
        Prev
      </button>

      <div className="month-popover" ref={popoverRef}>
        <button
          type="button"
          className="ghost-button month-trigger-button"
          onClick={() => setIsPickerOpen((open) => !open)}
          aria-expanded={isPickerOpen}
          aria-haspopup="dialog"
          aria-controls={pickerDialogLabelId}
        >
          {monthLabel}
        </button>

        {isPickerOpen ? (
          <div className="month-popover-panel" role="dialog" aria-labelledby={pickerDialogLabelId}>
            <div className="month-popover-header">
              <button
                type="button"
                className="ghost-button month-year-button"
                onClick={() => setPickerYear((year) => year - 1)}
                aria-label="Previous year"
              >
                {'<'}
              </button>
              <strong id={pickerDialogLabelId}>{pickerYear}</strong>
              <button
                type="button"
                className="ghost-button month-year-button"
                onClick={() => setPickerYear((year) => year + 1)}
                aria-label="Next year"
              >
                {'>'}
              </button>
            </div>
            <div className="month-option-grid">
              {MONTH_NAME_OPTIONS.map((label, index) => {
                const monthNumber = index + 1;
                const optionMonthValue = `${pickerYear}-${padTwo(monthNumber)}`;
                const isSelected = optionMonthValue === monthValue;

                return (
                  <button
                    key={label}
                    type="button"
                    className={`month-option-button ${isSelected ? 'month-option-button-selected' : ''}`.trim()}
                    onClick={() => onSelectMonth(monthNumber)}
                  >
                    {label.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        className="ghost-button month-step-button"
        onClick={() => onChangeMonth(shiftMonthValue(monthValue, 1))}
        aria-label="Next month"
      >
        Next
      </button>
    </div>
  );
}
