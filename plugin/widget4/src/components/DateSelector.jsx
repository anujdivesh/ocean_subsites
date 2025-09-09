import React, { useState, useEffect, useRef } from 'react';

function DateSelector({ item, onDateChange }) {
  const _isMounted = useRef(true);
  const [startDateOrig, setStartDateOrig] = useState(new Date());
  const [endDateOrig, setEndDateOrig] = useState(new Date());
  const [currentDate, setCurrentDate] = useState(new Date());
  const dateArray = useRef([]);

  // Safety check (no early return to preserve hooks order)
  if (!item || !item.layer_information) {
    console.warn('DateSelector: item or layer_information is undefined', item);
  }

  // Initialize dates from item after hooks are declared
  useEffect(() => {
    if (item?.layer_information) {
      const nextStart = new Date(item.layer_information.timeIntervalStart || new Date());
      const nextEnd = new Date(item.layer_information.timeIntervalEnd || new Date());
      if (!startDateOrig || startDateOrig.getTime() !== nextStart.getTime()) {
        setStartDateOrig(nextStart);
      }
      if (!endDateOrig || endDateOrig.getTime() !== nextEnd.getTime()) {
        setEndDateOrig(nextEnd);
      }
    }
  }, [item?.layer_information?.timeIntervalStart, item?.layer_information?.timeIntervalEnd, startDateOrig, endDateOrig]);

  var spec = item.layer_information?.specific_timestemps || null;
  var specifc_stemps = item.layer_information?.specific_timestemps && item.layer_information.specific_timestemps !== null ? item.layer_information.specific_timestemps.split(',') : null;
  var weekRange = item.layer_information?.interval_step && item.layer_information.interval_step !== null ? item.layer_information.interval_step.split(',') : null;
  const format = item?.layer_information?.datetime_format;

  // Helpers
  const formatDateToISO = (date) => {
    if (!(date instanceof Date) || isNaN(date.getTime())) return '';
    return date.toISOString().split('.')[0] + 'Z';
  };

  const sanitizeTimestamp = (s) => {
    const raw = String(s || '').trim().replace(/\s+/g, '');
    if (!raw) return null;
    return raw.endsWith('Z') ? raw : `${raw}Z`;
  };

  const parseValidDate = (s) => {
    const clean = sanitizeTimestamp(s);
    if (!clean) return null;
    const d = new Date(clean);
    return isNaN(d.getTime()) ? null : d;
  };

  // Initialize currentDate based on format and available timestamps
  useEffect(() => {
    if (!_isMounted.current) return;
    const effectFormat = item?.layer_information?.datetime_format;
    const setIfChanged = (next) => {
      if (!currentDate || currentDate.getTime() !== next.getTime()) {
        setCurrentDate(next);
      }
    };
    if (effectFormat === 'DAILY' || effectFormat === 'HOURLY') {
      const next = new Date(item?.layer_information?.timeIntervalEnd || new Date());
      setIfChanged(next);
    } else if (effectFormat === 'MONTHLY' || effectFormat === '3MONTHLY' || effectFormat === 'WEEKLY' || effectFormat === 'WEEKLY_NRT' || effectFormat === '3MONTHLY_SEASONAL') {
      if (spec) {
        const dateTimeArray = spec
          .split(',')
          .map((t) => parseValidDate(t))
          .filter((d) => d);
        dateArray.current = dateTimeArray;
        const last = dateTimeArray[dateTimeArray.length - 1];
        if (last) setIfChanged(last);
      }
    }
    return () => { _isMounted.current = false };
  }, [format, spec, item?.layer_information?.timeIntervalEnd, currentDate]);

  // Handle date changes and notify parent
  const handleChange = (date) => {
    setCurrentDate(date);
    if (onDateChange) {
      onDateChange({
        currentDate: date,
        timeIntervalStart: formatDateToISO(startDateOrig),
        timeIntervalEnd: formatDateToISO(date)
      });
    }
  };

  // Emit initial/current date to parent so defaults align with what's shown
  const lastEmittedRef = useRef({ start: null, end: null });
  useEffect(() => {
    if (!item?.layer_information || !currentDate) return;
    const startIso = formatDateToISO(startDateOrig);
    const endIso = formatDateToISO(currentDate);
    const last = lastEmittedRef.current;
    if (last.start === startIso && last.end === endIso) return;
    lastEmittedRef.current = { start: startIso, end: endIso };
    if (onDateChange) {
      onDateChange({
        currentDate,
        timeIntervalStart: startIso,
        timeIntervalEnd: endIso
      });
    }
  }, [item?.layer_information, currentDate, startDateOrig, onDateChange]);

  // Render content based on datetime format
  let content;

  if (!format) {
    content = <div>Loading...</div>;
  }
  else if (format === 'DAILY') {
    content = (
      <div style={{ width: '90%' }}>
        <input
          type="date"
          className="form-control"
          value={currentDate.toISOString().split('T')[0]}
          min={startDateOrig.toISOString().split('T')[0]}
          max={endDateOrig.toISOString().split('T')[0]}
          onChange={(e) => handleChange(new Date(e.target.value))}
        />
      </div>
    );
  }
  else if (format === 'MONTHLY') {
    content = (
      <div style={{ width: '90%' }}>
        <input
          type="month"
          className="form-control"
          value={`${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`}
          onChange={(e) => {
            const [year, month] = e.target.value.split('-');
            handleChange(new Date(parseInt(year), parseInt(month) - 1, 1));
          }}
        />
      </div>
    );
  }
  else if (format === 'WEEKLY' && weekRange) {
    content = (
      <div style={{ width: '80%' }}>
        <select 
          className="form-select form-select-sm"
          value={(() => {
            const iso = formatDateToISO(currentDate);
            return iso || '';
          })()}
          onChange={(e) => {
            const sanitized = sanitizeTimestamp(e.target.value);
            if (!sanitized) return;
            const d = new Date(sanitized);
            if (isNaN(d.getTime())) return;
            handleChange(d);
          }}
        >
          {weekRange.map((week, index) => (
            <option key={index} value={sanitizeTimestamp(specifc_stemps?.[index] || '') || ''}>
              {week} Week
            </option>
          ))}
        </select>
      </div>
    );
  }
  else if (format === '3MONTHLY' && dateArray.current.length > 0) {
    // Extract unique years
    const years = [...new Set(dateArray.current.map(d => new Date(d).getFullYear()))].sort();
    const currentYear = currentDate.getFullYear();
    
    // Get months for current year
    const monthsInYear = dateArray.current
      .filter(d => new Date(d).getFullYear() === currentYear)
      .map(d => new Date(d).getMonth())
      .filter((m, i, arr) => arr.indexOf(m) === i)
      .sort();

    content = (
      <div style={{ width: '80%', display: 'flex', gap: '5px' }}>
        <select
          className="form-select form-select-sm"
          value={currentYear}
          onChange={(e) => {
            const year = parseInt(e.target.value);
            const firstMonth = dateArray.current
              .filter(d => new Date(d).getFullYear() === year)[0];
            if (firstMonth) handleChange(new Date(firstMonth));
          }}
        >
          {years.map(year => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
        
        <select
          className="form-select form-select-sm"
          value={currentDate.getMonth()}
          onChange={(e) => {
            const month = parseInt(e.target.value);
            const matchingDate = dateArray.current
              .find(d => {
                const date = new Date(d);
                return date.getFullYear() === currentYear && date.getMonth() === month;
              });
            if (matchingDate) handleChange(new Date(matchingDate));
          }}
        >
          {monthsInYear.map(m => {
            const startMonth = new Date(currentYear, m, 1).toLocaleString('default', { month: 'short' });
            const endMonth = new Date(currentYear, m + 2, 1).toLocaleString('default', { month: 'short' });
            return (
              <option key={m} value={m}>
                {startMonth} - {endMonth}
              </option>
            );
          })}
        </select>
      </div>
    );
  }
  else {
    content = <div>Date format not supported: {format}</div>;
  }

  return (
    <div className="row align-items-center" style={{ marginTop: '10px', marginBottom: '8px', color: 'var(--color-text)' }}>
      <div className="col-sm-4">
        <div style={{ fontSize: '13px', color: 'var(--color-text)' }}>Date Range:</div>
      </div>
      <div className="col-sm-8">
        {content}
      </div>
    </div>
  );
}

export default DateSelector;
