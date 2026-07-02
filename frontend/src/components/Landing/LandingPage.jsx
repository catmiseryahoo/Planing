import React, { useState } from 'react';
import { m, LazyMotion, domAnimation } from 'motion/react';
import { supabase } from '../../supabaseClient';
import './landing.css';

export default function LandingPage() {
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [lastName, setLastName] = useState('');
  const [organization, setOrganization] = useState('');
  const [phone, setPhone] = useState('');
  const [messenger, setMessenger] = useState('');
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthMessage('');
    setIsLoading(true);

    try {
      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        // Since original app disabled self-registration, we might still allow it if configured
        const { data, error } = await supabase.auth.signUp({ 
          email, 
          password,
          options: {
            data: { 
              name: name,
              last_name: lastName,
              organization: organization,
              phone: phone,
              messenger: messenger
            }
          }
        });
        if (error) throw error;
        if (data?.user && !data?.session) {
          setAuthMessage('Регистрация успешна. Пожалуйста, проверьте email для подтверждения.');
        } else {
          setAuthMessage('Регистрация успешна. Вы можете войти в систему.');
        }
      }
    } catch (err) {
      if (err.message && err.message.includes('Database error saving new user')) {
        setAuthError('Ошибка регистрации: Возможно, организация с таким названием уже существует.');
      } else {
        setAuthError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fadeInUp = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0 }
  };

  return (
    <LazyMotion features={domAnimation}>
      <div className="landing-container">
        <div className="landing-background">
          <div className="landing-glow"></div>
          <div className="landing-glow-2"></div>
        </div>

        <div className="landing-content">
          <nav className="landing-nav">
            <div className="landing-logo">Orbite Planing</div>
            <button className="btn-outline" onClick={() => {
              document.getElementById('auth-section').scrollIntoView({ behavior: 'smooth' });
            }}>
              Начать работу
            </button>
          </nav>

          <m.section 
            className="landing-hero"
            initial="hidden"
            animate="visible"
            variants={{
              visible: { transition: { staggerChildren: 0.15 } }
            }}
          >
            <m.h1 variants={fadeInUp} className="hero-title">
              Планирование будущего с помощью <span style={{ color: '#f97316' }}>ИИ Агентов</span>
            </m.h1>
            <m.p variants={fadeInUp} className="hero-subtitle">
              Orbite Planing превращает хаос в систему. Используйте мощь искусственного интеллекта для автоматизации задач, проверки архитектуры и мозгового штурма.
            </m.p>
            <m.div variants={fadeInUp}>
              <button className="btn-modern" style={{ width: 'auto', padding: '1rem 2rem' }} onClick={() => {
                document.getElementById('auth-section').scrollIntoView({ behavior: 'smooth' });
              }}>
                Попробовать бесплатно
              </button>
            </m.div>
          </m.section>

          <m.section 
            className="landing-stats"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={{
              visible: { transition: { staggerChildren: 0.1 } }
            }}
          >
            {[
              { value: '50%', label: 'Ускорение планирования' },
              { value: '10k+', label: 'Оптимизированных задач' },
              { value: '99%', label: 'Успешных релизов' },
            ].map((stat, i) => (
              <m.div key={i} variants={fadeInUp} className="stat-item">
                <div className="stat-value">{stat.value}</div>
                <div className="stat-label">{stat.label}</div>
              </m.div>
            ))}
          </m.section>

          <section className="landing-agents">
            <m.h2 
              className="landing-section-title"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              Ваши новые коллеги
            </m.h2>
            <div className="agents-grid">
              {[
                { icon: '📄', title: 'PRD to Plan', desc: 'Автоматически конвертирует бизнес-требования в четкие задачи, этапы и распределяет ресурсы.' },
                { icon: '🧠', title: 'Roadmap Brainstorm', desc: 'Анализирует проект и предлагает альтернативные пути развития и оптимизации сроков.' },
                { icon: '🔥', title: 'Grill Me', desc: 'Стресс-тестирует вашу архитектуру и находит узкие места в плане до начала разработки.' }
              ].map((agent, i) => (
                <m.div 
                  key={i}
                  className="agent-card"
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.1 }}
                  viewport={{ once: true }}
                >
                  <div className="agent-icon">{agent.icon}</div>
                  <h3 className="agent-title">{agent.title}</h3>
                  <p className="agent-desc">{agent.desc}</p>
                </m.div>
              ))}
            </div>
          </section>

          <m.section 
            id="auth-section"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="auth-wrapper">
              <div className="auth-tabs">
                <div 
                  className={`auth-tab ${authMode === 'login' ? 'active' : ''}`}
                  onClick={() => { setAuthMode('login'); setAuthError(''); setAuthMessage(''); }}
                >
                  Вход
                </div>
                <div 
                  className={`auth-tab ${authMode === 'register' ? 'active' : ''}`}
                  onClick={() => { setAuthMode('register'); setAuthError(''); setAuthMessage(''); }}
                >
                  Регистрация
                </div>
              </div>

              {authError && <div style={{ color: '#ef4444', marginBottom: '1rem', fontSize: '0.9rem', textAlign: 'center' }}>{authError}</div>}
              {authMessage && <div style={{ color: '#10b981', marginBottom: '1rem', fontSize: '0.9rem', textAlign: 'center' }}>{authMessage}</div>}

              <form onSubmit={handleAuth}>
                {authMode === 'register' && (
                  <>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <input 
                        className="auth-input-modern" 
                        type="text" 
                        placeholder="Имя" 
                        value={name} 
                        onChange={e => setName(e.target.value)} 
                        required 
                      />
                      <input 
                        className="auth-input-modern" 
                        type="text" 
                        placeholder="Фамилия" 
                        value={lastName} 
                        onChange={e => setLastName(e.target.value)} 
                        required 
                      />
                    </div>
                    <input 
                      className="auth-input-modern" 
                      type="text" 
                      placeholder="Название организации" 
                      value={organization} 
                      onChange={e => setOrganization(e.target.value)} 
                      required 
                    />
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <input 
                        className="auth-input-modern" 
                        type="tel" 
                        placeholder="Телефон" 
                        value={phone} 
                        onChange={e => setPhone(e.target.value)} 
                        required 
                      />
                      <input 
                        className="auth-input-modern" 
                        type="text" 
                        placeholder="Telegram / WhatsApp" 
                        value={messenger} 
                        onChange={e => setMessenger(e.target.value)} 
                        required 
                      />
                    </div>
                  </>
                )}
                <input 
                  className="auth-input-modern" 
                  type="email" 
                  placeholder="Email" 
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  required 
                />
                <input 
                  className="auth-input-modern" 
                  type="password" 
                  placeholder="Пароль" 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  required 
                />
                <button className="btn-modern" type="submit" disabled={isLoading}>
                  {isLoading ? 'Загрузка...' : (authMode === 'login' ? 'Войти' : 'Создать аккаунт')}
                </button>
              </form>
            </div>
          </m.section>
        </div>
      </div>
    </LazyMotion>
  );
}
