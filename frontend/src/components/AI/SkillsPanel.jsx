import React, { useState } from 'react';
import { m } from 'framer-motion';
import { supabase } from '../../supabaseClient';

export default function SkillsPanel({ isOpen, onClose, shouldReduceMotion }) {
  const [activeSkill, setActiveSkill] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleRunSkill = (skill) => {
    setActiveSkill(skill);
    setResponse('');
    setPrompt('');
  };

  const handleSend = async () => {
    if (!prompt.trim()) return;
    setIsLoading(true);
    setResponse('');
    
    try {
      const { data, error } = await supabase.functions.invoke('ai-agent-runner', {
        body: { skill: activeSkill, payload: prompt }
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setResponse(data.result);
    } catch (err) {
      setResponse(`Ошибка: ${err.message}`);
    } finally {
      setIsLoading(false);
      setPrompt('');
    }
  };

  return (
    <m.div
      className="glass-panel"
      style={{
        position: 'fixed',
        top: '60px',
        right: '20px',
        width: '380px',
        height: 'calc(100vh - 80px)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        borderLeft: '1px solid var(--accent-color, #f97316)',
        backgroundColor: 'rgba(20, 20, 20, 0.85)'
      }}
      initial={shouldReduceMotion ? false : { opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
    >
      <div className="panel-header" style={{ borderBottom: '1px solid var(--panel-border)', padding: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#f97316' }}>Навыки ИИ</h3>
        <button className="btn btn-icon" onClick={onClose} title="Закрыть">✕</button>
      </div>

      <div className="panel-content" style={{ padding: '15px', overflowY: 'auto', flex: 1 }}>
        {!activeSkill ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Выберите навык ИИ-Агента для помощи в планировании проекта.
            </p>
            
            <div className="skill-card" style={skillCardStyle} onClick={() => handleRunSkill('prd-to-plan')} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
              <h4 style={skillTitleStyle}>PRD to Plan</h4>
              <p style={skillDescStyle}>Автоматически конвертирует бизнес-требования (PRD) в четкие задачи и этапы проекта.</p>
            </div>

            <div className="skill-card" style={skillCardStyle} onClick={() => handleRunSkill('brainstorming')} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
              <h4 style={skillTitleStyle}>Roadmap Brainstorm</h4>
              <p style={skillDescStyle}>Анализирует проект и предлагает альтернативные пути развития и оптимизации сроков.</p>
            </div>

            <div className="skill-card" style={skillCardStyle} onClick={() => handleRunSkill('grill-me')} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
              <h4 style={skillTitleStyle}>Stress-Test (Grill Me)</h4>
              <p style={skillDescStyle}>Стресс-тестирует вашу архитектуру и находит узкие места в плане до начала разработки.</p>
            </div>

            <div className="skill-card" style={skillCardStyle} onClick={() => handleRunSkill('request-refactor-plan')} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
              <h4 style={skillTitleStyle}>Refactor & TDD Planner</h4>
              <p style={skillDescStyle}>Генерирует технические задачи для тестирования (TDD) и рефакторинга кода.</p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <button className="btn" onClick={() => setActiveSkill(null)} style={{ alignSelf: 'flex-start', marginBottom: '15px', fontSize: '0.8rem' }}>
              ← Назад
            </button>
            <h4 style={{ color: '#f97316', marginBottom: '10px', marginTop: 0 }}>{activeSkill.replace(/-/g, ' ').toUpperCase()}</h4>
            <div style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '10px', color: 'var(--text-secondary)', fontSize: '0.85rem', border: '1px solid var(--panel-border)', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
              {isLoading ? (
                <div style={{ color: '#f97316' }}>Думаю... (подключаюсь к LLM и MCP)</div>
              ) : response ? (
                <div style={{ color: 'var(--text-primary)' }}>{response}</div>
              ) : (
                <>
                  [Рабочая область ИИ-агента]<br/><br/>Ожидаю вашего ввода для запуска навыка...
                </>
              )}
            </div>
            <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
              <input 
                type="text" 
                placeholder="Запрос..." 
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--panel-border)', color: 'white', padding: '8px 10px', borderRadius: '4px', outline: 'none', fontSize: '0.85rem' }} 
              />
              <button className="btn" onClick={handleSend} disabled={isLoading} style={{ backgroundColor: '#ea580c', color: 'white', border: 'none', opacity: isLoading ? 0.5 : 1 }}>
                Отправить
              </button>
            </div>
          </div>
        )}
      </div>
    </m.div>
  );
}

const skillCardStyle = {
  backgroundColor: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--panel-border)',
  borderRadius: '8px',
  padding: '12px',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
};

const skillTitleStyle = { margin: '0 0 5px 0', fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 500 };
const skillDescStyle = { margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 };

function handleMouseEnter(e) {
  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)';
  e.currentTarget.style.borderColor = '#ea580c';
}

function handleMouseLeave(e) {
  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)';
  e.currentTarget.style.borderColor = 'var(--panel-border)';
}
