import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { formatDateShort, parseLocalDate, toDateInputValue } from '../shared/finance.js';

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_LABELS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export const DatePickerInput = forwardRef(function DatePickerInput({
    value = '',
    onChange,
    min,
    max,
    className = 'input',
    placeholder = 'Select date',
    disabled = false,
    id
}, ref) {
    const rootRef = useRef(null);
    const [open, setOpen] = useState(false);
    const selected = parseLocalDate(value);
    const today = new Date();

    const [viewYear, setViewYear] = useState(() => selected?.getFullYear() ?? today.getFullYear());
    const [viewMonth, setViewMonth] = useState(() => selected?.getMonth() ?? today.getMonth());

    const minDate = parseLocalDate(min);
    const maxDate = parseLocalDate(max);

    const yearOptions = useMemo(() => {
        const currentYear = today.getFullYear();
        let startYear = currentYear - 50;
        let endYear = currentYear + 10;

        if (minDate) {
            startYear = Math.min(startYear, minDate.getFullYear());
        }

        if (maxDate) {
            endYear = Math.max(endYear, maxDate.getFullYear());
        }

        startYear = Math.min(startYear, viewYear);
        endYear = Math.max(endYear, viewYear);

        const years = [];
        for (let year = endYear; year >= startYear; year -= 1) {
            years.push(year);
        }

        return years;
    }, [maxDate, minDate, today, viewYear]);

    useEffect(() => {
        if (!selected) {
            return;
        }

        setViewYear(selected.getFullYear());
        setViewMonth(selected.getMonth());
    }, [value]);

    useEffect(() => {
        if (!open) {
            return undefined;
        }

        const handleOutsideClick = (event) => {
            if (rootRef.current?.contains(event.target)) {
                return;
            }

            setOpen(false);
        };

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                setOpen(false);
            }
        };

        // Defer so the click that opened the picker does not immediately close it.
        const timer = window.setTimeout(() => {
            document.addEventListener('click', handleOutsideClick, true);
        }, 0);

        document.addEventListener('keydown', handleKeyDown);

        return () => {
            window.clearTimeout(timer);
            document.removeEventListener('click', handleOutsideClick, true);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [open]);

    const calendarDays = useMemo(() => {
        const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
        const leadingBlanks = new Date(viewYear, viewMonth, 1).getDay();
        const cells = [];

        for (let index = 0; index < leadingBlanks; index += 1) {
            cells.push({ key: `blank-${index}`, day: null });
        }

        for (let day = 1; day <= daysInMonth; day += 1) {
            cells.push({ key: `${viewYear}-${viewMonth}-${day}`, day });
        }

        return cells;
    }, [viewMonth, viewYear]);

    const isDayDisabled = (day) => {
        const date = startOfDay(new Date(viewYear, viewMonth, day));

        if (minDate && date < startOfDay(minDate)) {
            return true;
        }

        if (maxDate && date > startOfDay(maxDate)) {
            return true;
        }

        return false;
    };

    const shiftMonth = (delta) => {
        const next = new Date(viewYear, viewMonth + delta, 1);
        setViewYear(next.getFullYear());
        setViewMonth(next.getMonth());
    };

    const pickDay = (day, event) => {
        event.preventDefault();
        event.stopPropagation();

        if (isDayDisabled(day)) {
            return;
        }

        const nextValue = toDateInputValue(new Date(viewYear, viewMonth, day));
        setOpen(false);
        onChange?.(nextValue);
    };

    const togglePicker = (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (disabled) {
            return;
        }

        if (open) {
            setOpen(false);
            return;
        }

        if (selected) {
            setViewYear(selected.getFullYear());
            setViewMonth(selected.getMonth());
        }

        setOpen(true);
    };

    return (
        <div className="date-picker-input" ref={rootRef}>
            <button
                id={id}
                ref={ref}
                type="button"
                className={`date-picker-trigger ${className}`.trim()}
                disabled={disabled}
                aria-haspopup="dialog"
                aria-expanded={open}
                onClick={togglePicker}
            >
                {value ? formatDateShort(value) : placeholder}
            </button>
            {open ? (
                <div
                    className="date-picker-popover"
                    role="dialog"
                    aria-label="Choose a date"
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="date-picker-nav">
                        <button
                            type="button"
                            className="button ghost date-picker-nav-btn"
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                                event.stopPropagation();
                                shiftMonth(-1);
                            }}
                            aria-label="Previous month"
                        >
                            ‹
                        </button>
                        <div className="date-picker-nav-selects">
                            <select
                                className="select date-picker-select"
                                value={viewMonth}
                                aria-label="Month"
                                onMouseDown={(event) => event.stopPropagation()}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => setViewMonth(Number(event.target.value))}
                            >
                                {MONTH_LABELS.map((label, monthIndex) => (
                                    <option key={label} value={monthIndex}>{label}</option>
                                ))}
                            </select>
                            <select
                                className="select date-picker-select"
                                value={viewYear}
                                aria-label="Year"
                                onMouseDown={(event) => event.stopPropagation()}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => setViewYear(Number(event.target.value))}
                            >
                                {yearOptions.map((year) => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                        </div>
                        <button
                            type="button"
                            className="button ghost date-picker-nav-btn"
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                                event.stopPropagation();
                                shiftMonth(1);
                            }}
                            aria-label="Next month"
                        >
                            ›
                        </button>
                    </div>
                    <div className="date-picker-weekdays">
                        {WEEKDAY_LABELS.map((label) => (
                            <span key={label}>{label}</span>
                        ))}
                    </div>
                    <div className="date-picker-grid">
                        {calendarDays.map((cell) => (
                            cell.day === null ? (
                                <span key={cell.key} className="date-picker-day is-empty" />
                            ) : (
                                <button
                                    key={cell.key}
                                    type="button"
                                    className={[
                                        'date-picker-day',
                                        selected
                                        && selected.getFullYear() === viewYear
                                        && selected.getMonth() === viewMonth
                                        && selected.getDate() === cell.day
                                            ? 'is-selected'
                                            : '',
                                        isDayDisabled(cell.day) ? 'is-disabled' : ''
                                    ].filter(Boolean).join(' ')}
                                    disabled={isDayDisabled(cell.day)}
                                    onMouseDown={(event) => pickDay(cell.day, event)}
                                >
                                    {cell.day}
                                </button>
                            )
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
});
