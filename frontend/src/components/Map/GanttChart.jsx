import React, { useMemo, useRef, useState } from 'react';
import './GanttChart.css';

export default function GanttChart({ tasks, stages, onSelectTask }) {
  const [dayWidth, setDayWidth] = useState(40);
  const containerRef = useRef(null);

  // Вычисляем границы дат для отображения
  const { minDate, days } = useMemo(() => {
    let min = new Date();
    let max = new Date();
    max.setDate(max.getDate() + 30); // По умолчанию показываем 30 дней вперед

    tasks.forEach(t => {
      if (t.start_date) {
        const d = new Date(t.start_date);
        if (d < min) min = d;
      }
      if (t.date || t.due_date) {
        const d = new Date(t.date || t.due_date);
        if (d > max) max = d;
      }
    });

    // Добавляем отступы
    min.setDate(min.getDate() - 5);
    max.setDate(max.getDate() + 5);

    const timeDiff = max.getTime() - min.getTime();
    const daysCount = Math.ceil(timeDiff / (1000 * 3600 * 24));
    
    const dArray = [];
    for (let i = 0; i <= daysCount; i++) {
      const d = new Date(min);
      d.setDate(d.getDate() + i);
      dArray.push(d);
    }

    return { minDate: min, days: dArray };
  }, [tasks]);
  const timelineWidth = days.length * dayWidth;

  const handleWheel = (e) => {
    if (!e.altKey) return;
    e.preventDefault();

    const container = containerRef.current;
    const rect = container?.getBoundingClientRect();
    const pointerX = rect ? e.clientX - rect.left : 0;
    const oldWidth = dayWidth;
    const delta = e.deltaY || e.deltaX;
    const nextWidth = Math.min(96, Math.max(18, oldWidth + (delta < 0 ? 4 : -4)));
    if (nextWidth === oldWidth) return;

    setDayWidth(nextWidth);

    if (container) {
      const scale = nextWidth / oldWidth;
      requestAnimationFrame(() => {
        container.scrollLeft = (container.scrollLeft + pointerX) * scale - pointerX;
      });
    }
  };

  const getTaskStyle = (task) => {
    const start = task.start_date ? new Date(task.start_date) : new Date();
    const end = (task.date || task.due_date) ? new Date(task.date || task.due_date) : new Date(start.getTime() + 86400000*2);

    const startOffset = Math.max(0, (start.getTime() - minDate.getTime()) / (1000 * 3600 * 24));
    let duration = (end.getTime() - start.getTime()) / (1000 * 3600 * 24);
    if (duration < 1) duration = 1;

    // Используем цвет этапа
    const stage = stages.find(s => s.id === task.stage_id);
    const barColor = stage?.color || getStatusColor(task.status);

    return {
      left: `${startOffset * dayWidth}px`,
      width: `${duration * dayWidth}px`,
      backgroundColor: barColor
    };
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'done': return '#10b981';
      case 'in-progress': return '#3b82f6';
      case 'review': return '#f59e0b';
      case 'overdue': return '#ef4444';
      default: return '#6b7280';
    }
  };

  return (
    <div className="gantt-container">
      <div
        ref={containerRef}
        className="gantt-scroll"
        onWheel={handleWheel}
        style={{ '--gantt-day-width': `${dayWidth}px` }}
      >
      <div className="gantt-header">
        <div className="gantt-row-title-header">Задачи</div>
        <div className="gantt-timeline-header">
          {days.map((d, i) => (
            <div key={i} className={`gantt-day-tick ${d.getDay() === 0 || d.getDay() === 6 ? 'weekend' : ''}`}>
              <div className="day-name">{d.toLocaleDateString('ru-RU', { weekday: 'short' })}</div>
              <div className="day-num">{d.getDate()}</div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="gantt-body">
        {stages.map(stage => {
          const stageTasks = tasks.filter(t => t.stage_id === stage.id);
          if (stageTasks.length === 0) return null;
          
          return (
            <div key={`stage-${stage.id}`} className="gantt-stage-group">
              <div className="gantt-stage-title-row">
                <div className="gantt-stage-title">
                  <span style={{display: 'inline-block', width: '12px', height: '12px', borderRadius: '3px', backgroundColor: stage.color || '#3b82f6', marginRight: '0.5rem'}}></span>
                  {stage.name}
                </div>
                <div className="gantt-stage-title-timeline" style={{ width: `${timelineWidth}px`, minWidth: `${timelineWidth}px` }} />
              </div>
              {stageTasks.map(task => (
                <div key={task.id} className="gantt-row" onClick={(e) => { e.stopPropagation(); onSelectTask(task); }}>
                  <div className="gantt-row-title">{task.name}</div>
                  <div className="gantt-timeline-row" style={{ width: `${timelineWidth}px`, minWidth: `${timelineWidth}px` }}>
                    <div className="gantt-bar" style={getTaskStyle(task)}>
                      <span className="gantt-bar-label">{task.name}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
