import { useState } from 'react';
import { supabase } from '../../supabaseClient';

export default function ProfilePanel({ currentUser, users, setUsers, setCurrentUser }) {
  const [profileEmail, setProfileEmail] = useState(currentUser.email || '');
  const [profileName, setProfileName] = useState(currentUser.name || '');
  const [profilePhone, setProfilePhone] = useState(currentUser.phone || '');
  const [profileTelegram, setProfileTelegram] = useState(currentUser.telegram || '');
  const [profileAvatarColor, setProfileAvatarColor] = useState(currentUser.avatar_color || '#3b82f6');
  const [profileAvatarUrl, setProfileAvatarUrl] = useState(currentUser.avatar_url || '');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [profileUserId, setProfileUserId] = useState(currentUser.id);

  if (profileUserId !== currentUser.id) {
    setProfileUserId(currentUser.id);
    setProfileEmail(currentUser.email || '');
    setProfileName(currentUser.name || '');
    setProfilePhone(currentUser.phone || '');
    setProfileTelegram(currentUser.telegram || '');
    setProfileAvatarColor(currentUser.avatar_color || '#3b82f6');
    setProfileAvatarUrl(currentUser.avatar_url || '');
    setNewPassword('');
    setNewPasswordConfirm('');
  }

  const getUserInitials = (name) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : '?';

  const handleUpdateProfile = async () => {
    const nextEmail = profileEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      alert("Пожалуйста, введите корректный Email.");
      return;
    }

    const phoneDigits = profilePhone.replace(/\D/g, '');
    if (phoneDigits && phoneDigits.length < 11) {
      alert("Пожалуйста, введите полный номер телефона (11 цифр).");
      return;
    }

    if (nextEmail !== (currentUser.email || '').toLowerCase()) {
      const { error: emailError } = await supabase.functions.invoke('update-user-email', {
        body: {
          userId: currentUser.id,
          email: nextEmail
        }
      });

      if (emailError) {
        alert("Ошибка обновления Email: " + emailError.message);
        return;
      }
    }

    const updates = { 
      email: nextEmail,
      name: profileName, 
      phone: profilePhone, 
      telegram: profileTelegram, 
      avatar_color: profileAvatarColor, 
      avatar_url: profileAvatarUrl 
    };
    
    const { error } = await supabase.from('profiles').update(updates).eq('id', currentUser.id);
    if (!error) {
      setCurrentUser({ ...currentUser, ...updates });
      setUsers(users.map(u => u.id === currentUser.id ? { ...u, ...updates } : u));
      alert("Профиль обновлен!");
    } else {
      alert("Ошибка обновления профиля: " + error.message);
    }
  };

  const handleUpdatePassword = async () => {
    if (currentUser.role !== 'Администратор') return;

    if (newPassword.length < 6) {
      alert("Пароль должен быть не короче 6 символов.");
      return;
    }

    if (newPassword !== newPasswordConfirm) {
      alert("Пароли не совпадают.");
      return;
    }

    const { error } = await supabase.functions.invoke('update-user-password', {
      body: {
        userId: currentUser.id,
        password: newPassword
      }
    });

    if (error) {
      alert("Ошибка изменения пароля: " + error.message);
      return;
    }

    setNewPassword('');
    setNewPasswordConfirm('');
    alert("Пароль обновлен!");
  };

  const handlePhoneChange = (e) => {
    let val = e.target.value.replace(/\D/g, '');
    if (!val) { setProfilePhone(''); return; }
    if (val.length > 0 && val[0] === '8') val = '7' + val.substring(1);
    else if (val.length > 0 && val[0] !== '7') val = '7' + val;

    let res = '+7';
    if (val.length > 1) res += ' (' + val.substring(1, 4);
    if (val.length >= 5) res += ') ' + val.substring(4, 7);
    if (val.length >= 8) res += '-' + val.substring(7, 9);
    if (val.length >= 10) res += '-' + val.substring(9, 11);
    
    setProfilePhone(res);
  };

  return (
    <>
      <div className="panel-header"><h2>Личный кабинет</h2></div>
      <div className="panel-content" style={{maxWidth: '500px'}}>
        <div className="detail-section">
          <div className="detail-label">Ваш Email</div>
          <input className="edit-select" type="email" value={profileEmail} onChange={e=>setProfileEmail(e.target.value)} placeholder="name@example.com" />
        </div>
        <div className="detail-section">
          <div className="detail-label">ФИО</div>
          <input className="edit-select" value={profileName} onChange={e=>setProfileName(e.target.value)} placeholder="Иван Иванов" />
        </div>
        <div className="detail-section">
          <div className="detail-label">Телефон</div>
          <input 
            className="edit-select" 
            value={profilePhone} 
            onChange={handlePhoneChange} 
            placeholder="+7 (999) 000-00-00" 
            maxLength={18}
          />
        </div>
        <div className="detail-section">
          <div className="detail-label">Telegram</div>
          <div style={{display:'flex', alignItems:'center', background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-md)', padding: '0 0.75rem', border: '1px solid var(--panel-border)'}}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="#2AABEE"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.18-.08-.05-.19-.02-.27 0-.11.03-1.87 1.18-5.28 3.45-.5.35-.95.53-1.35.52-.45-.01-1.31-.25-1.95-.45-.79-.26-1.42-.4-1.36-.84.03-.22.34-.44.93-.68 3.65-1.59 6.09-2.62 7.32-3.13 3.48-1.45 4.2-1.7 4.67-1.71.1 0 .34.02.46.12.1.09.13.21.14.33.02.16.01.35-.01.46z"/></svg>
            <span style={{color:'var(--text-secondary)', marginLeft: '0.5rem'}}>@</span>
            <input 
              className="edit-select" 
              style={{border:'none', background:'transparent', flex:1, marginBottom:0, paddingLeft: '0.2rem', outline: 'none'}} 
              value={profileTelegram} 
              onChange={e => setProfileTelegram(e.target.value.replace('@', ''))} 
              placeholder="username" 
            />
          </div>
        </div>
        <div className="detail-section">
          <div className="detail-label">Цвет профиля или фото (аватар)</div>
          <div style={{display:'flex', gap:'1rem', alignItems:'center', marginTop:'0.5rem'}}>
            {profileAvatarUrl ? (
              <img src={profileAvatarUrl} alt="avatar" style={{width:'48px', height:'48px', borderRadius:'50%', objectFit:'cover', border:'2px solid var(--panel-border)'}} />
            ) : (
              <div style={{width:'48px', height:'48px', borderRadius:'50%', backgroundColor: profileAvatarColor || '#ccc', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.2rem', fontWeight:'bold', color:'white'}}>
                {getUserInitials(currentUser.name || currentUser.email)}
              </div>
            )}
            <div style={{flex: 1}}>
              <input type="file" accept="image/*" onChange={(e) => {
                 if (e.target.files && e.target.files[0]) {
                    const reader = new FileReader();
                    reader.onload = (ev) => { setProfileAvatarUrl(ev.target.result); };
                    reader.readAsDataURL(e.target.files[0]);
                 }
              }} style={{fontSize:'0.8rem'}} />
              <div style={{fontSize:'0.75rem', color:'var(--text-secondary)', marginTop:'0.25rem'}}>Или цвет (если нет фото):</div>
              <div style={{display:'flex', gap:'0.25rem', marginTop:'0.25rem'}}>
                {['#3b82f6', '#ec4899', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444'].map(color => (
                  <div key={color} style={{width:'24px', height:'24px', borderRadius:'50%', backgroundColor: color, cursor:'pointer', border: profileAvatarColor === color ? '2px solid white' : '2px solid transparent'}} onClick={() => { setProfileAvatarColor(color); setProfileAvatarUrl(''); }} />
                ))}
              </div>
            </div>
          </div>
        </div>
        <button className="btn btn-primary" onClick={handleUpdateProfile}>Сохранить изменения</button>
        {currentUser.role === 'Администратор' && (
          <div className="detail-section password-section">
            <div className="detail-label">Смена пароля</div>
            <input
              className="edit-select"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Новый пароль"
              minLength={6}
            />
            <input
              className="edit-select"
              type="password"
              value={newPasswordConfirm}
              onChange={e => setNewPasswordConfirm(e.target.value)}
              placeholder="Повторите пароль"
              minLength={6}
            />
            <button className="btn" onClick={handleUpdatePassword}>Обновить пароль</button>
          </div>
        )}
      </div>
    </>
  );
}
