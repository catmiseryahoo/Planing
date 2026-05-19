import { useEffect, useRef, useState } from 'react';

const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const DAYS_RU = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

export default function DatePicker({ value, onChange, popupAlign = 'left' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    return value ? new Date(value + 'T00:00:00') : new Date();
  });
  const [lastValue, setLastValue] = useState(value);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (value !== lastValue) {
    setLastValue(value);
    if (value) setViewDate(new Date(value + 'T00:00:00'));
  }

  const selectedDate = value ? new Date(value + 'T00:00:00') : null;
  const today = new Date();
  today.setHours(0,0,0,0);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const firstDay = new Date(year, month, 1);
  let startDay = firstDay.getDay() - 1; // Monday = 0
  if (startDay < 0) startDay = 6;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells = [];
  // Previous month days
  for (let i = startDay - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, current: false });
  }
  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({ day: i, current: true });
  }
  // Next month days
  const remaining = 42 - cells.length;
  for (let i = 1; i <= remaining; i++) {
    cells.push({ day: i, current: false });
  }

  const handleSelectDay = (day, isCurrent) => {
    if (!isCurrent) return;
    const d = new Date(year, month, day);
    const iso = d.toISOString().split('T')[0];
    onChange(iso);
    setIsOpen(false);
  };

  const handlePrevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  const formatDisplay = (val) => {
    if (!val) return '—';
    const d = new Date(val + 'T00:00:00');
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const isSelected = (day) => {
    if (!selectedDate) return false;
    return selectedDate.getFullYear() === year && selectedDate.getMonth() === month && selectedDate.getDate() === day;
  };

  const isToday = (day) => {
    return today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
  };

  return (
    <div ref={ref} style={{position: 'relative'}}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%', height: '40px', padding: '0 0.75rem',
          border: '1px solid var(--panel-border)', borderRadius: 'var(--radius-md)',
          background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', fontSize: '0.875rem', boxSizing: 'border-box',
          transition: 'all 0.2s'
        }}
      >
        <span>{formatDisplay(value)}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      </div>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: popupAlign === 'right' ? 'auto' : 0,
          right: popupAlign === 'right' ? 0 : 'auto',
          marginTop: '4px',
          zIndex: 200,
          background: 'rgba(15, 23, 42, 0.97)', backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.15)', borderRadius: 'var(--radius-lg)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)', padding: '1rem',
          width: 'min(320px, calc(100vw - 2rem))',
          maxWidth: 'calc(100vw - 2rem)',
          animation: 'fadeIn 0.15s ease'
        }}>
          {/* Header */}
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
            <button onClick={handlePrevMonth} style={{background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>◀</button>
            <div style={{fontWeight: 600, fontSize: '1rem'}}>{MONTHS_RU[month]} {year}</div>
            <button onClick={handleNextMonth} style={{background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>▶</button>
          </div>

          {/* Day names */}
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '0.5rem'}}>
            {DAYS_RU.map(d => (
              <div key={d} style={{textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, padding: '4px 0'}}>{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px'}}>
            {cells.map((cell, i) => {
              const selected = cell.current && isSelected(cell.day);
              const todayMark = cell.current && isToday(cell.day);
              return (
                <div 
                  key={i}
                  onClick={() => handleSelectDay(cell.day, cell.current)}
                  style={{
                    textAlign: 'center', padding: '8px 0', borderRadius: '8px',
                    cursor: cell.current ? 'pointer' : 'default',
                    color: !cell.current ? 'rgba(148,163,184,0.3)' : selected ? 'white' : todayMark ? '#60a5fa' : 'var(--text-primary)',
                    background: selected ? 'var(--accent-color)' : 'transparent',
                    fontWeight: selected || todayMark ? 700 : 400,
                    fontSize: '0.95rem',
                    transition: 'all 0.15s',
                    border: todayMark && !selected ? '1px solid rgba(96,165,250,0.5)' : '1px solid transparent',
                  }}
                  onMouseEnter={(e) => { if (cell.current && !selected) e.target.style.background = 'rgba(255,255,255,0.1)'; }}
                  onMouseLeave={(e) => { if (!selected) e.target.style.background = 'transparent'; }}
                >
                  {cell.day}
                </div>
              );
            })}
          </div>

          {/* Quick actions */}
          <div style={{display: 'flex', gap: '0.5rem', marginTop: '1rem', borderTop: '1px solid var(--panel-border)', paddingTop: '0.75rem'}}>
            <button onClick={() => { onChange(new Date().toISOString().split('T')[0]); setIsOpen(false); }} style={{flex: 1, padding: '6px', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--panel-border)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem'}}>Сегодня</button>
            <button onClick={() => { onChange(''); setIsOpen(false); }} style={{flex: 1, padding: '6px', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--panel-border)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem'}}>Очистить</button>
          </div>
        </div>
      )}
    </div>
  );
}
