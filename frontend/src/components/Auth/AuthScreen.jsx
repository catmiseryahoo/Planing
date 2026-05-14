import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';

export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message);
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-title">Вход в Orbite</div>
        <div style={{color:'var(--text-secondary)', fontSize:'0.85rem', textAlign:'center', marginBottom:'1.5rem'}}>
          Регистрация закрыта. Обратитесь к Администратору для получения аккаунта.
        </div>
        {authError && <div className="auth-error">{authError}</div>}
        <form onSubmit={handleAuth} style={{display:'flex', flexDirection:'column'}}>
          <input className="auth-input" type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required />
          <input className="auth-input" type="password" placeholder="Пароль" value={password} onChange={e=>setPassword(e.target.value)} required />
          <button className="btn btn-primary" type="submit" style={{width:'100%', padding:'0.75rem', fontSize:'1rem'}}>
            Войти
          </button>
        </form>
      </div>
    </div>
  );
}
