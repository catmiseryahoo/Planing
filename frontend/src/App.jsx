import React, { useState, useEffect, useRef } from 'react';
import { supabase, supabaseAdmin } from './supabaseClient';
import './index.css';

const statusLabels = {
  'planned': 'План',
  'in-progress': 'В работе',
  'review': 'Проверка',
  'done': 'Готово',
  'overdue': 'Просрочено'
};

const formatDate = (dateString) => {
  if (!dateString) return 'Не задан';
  const date = new Date(dateString);
  if (isNaN(date)) return dateString;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
};

function App() {
  const [session, setSession] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [projects, setProjects] = useState([]);
  const [stages, setStages] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [isDataLoading, setIsDataLoading] = useState(false);

  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activeView, setActiveView] = useState('map'); // map, profile, admin
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [draggedStageId, setDraggedStageId] = useState(null);

  const [panelPos, setPanelPos] = useState({ x: window.innerWidth - 420, y: 80 });
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const [panelDragOffset, setPanelDragOffset] = useState({ x: 0, y: 0 });

  const [editName, setEditName] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editAssigneeId, setEditAssigneeId] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editChecklist, setEditChecklist] = useState([]);
  const [editAttachments, setEditAttachments] = useState([]);
  const [newChecklistItemText, setNewChecklistItemText] = useState('');
  const [commentText, setCommentText] = useState('');
  
  // Profile edit states
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileTelegram, setProfileTelegram] = useState('');
  const [profileAvatarColor, setProfileAvatarColor] = useState('');

  // Admin Create User states
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState('Сотрудник');

  const [isDragOverDropZone, setIsDragOverDropZone] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoadingAuth(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) fetchData();
  }, [session]);

  const fetchData = async () => {
    setIsDataLoading(true);
    try {
      const [projectsRes, stagesRes, tasksRes, profilesRes] = await Promise.all([
        supabase.from('projects').select('*').order('created_at', { ascending: true }),
        supabase.from('stages').select('*').order('order', { ascending: true }),
        supabase.from('tasks').select('*'),
        supabase.from('profiles').select('*')
      ]);

      setProjects(projectsRes.data || []);
      setStages(stagesRes.data || []);
      setTasks(tasksRes.data || []);
      setUsers(profilesRes.data || []);

      if (projectsRes.data?.length > 0 && !activeProjectId) {
        setActiveProjectId(projectsRes.data[0].id);
      }

      const me = profilesRes.data?.find(u => u.id === session.user.id);
      if (me) {
        setCurrentUser(me);
        setProfileName(me.name || '');
        setProfilePhone(me.phone || '');
        setProfileTelegram(me.telegram || '');
        setProfileAvatarColor(me.avatar_color || '#3b82f6');
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsDataLoading(false);
    }
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingPanel) return;
      setPanelPos({ x: e.clientX - panelDragOffset.x, y: e.clientY - panelDragOffset.y });
    };
    const handleMouseUp = () => setIsDraggingPanel(false);

    if (isDraggingPanel) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingPanel, panelDragOffset]);

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleUpdateProfile = async () => {
    if (!currentUser) return;
    
    // Проверка правильности телефона (если введен)
    const phoneDigits = profilePhone.replace(/\D/g, '');
    if (phoneDigits && phoneDigits.length < 11) {
      alert("Пожалуйста, введите полный номер телефона (11 цифр).");
      return;
    }

    const updates = { name: profileName, phone: profilePhone, telegram: profileTelegram, avatar_color: profileAvatarColor };
    const { error } = await supabase.from('profiles').update(updates).eq('id', currentUser.id);
    if (!error) {
      setCurrentUser({ ...currentUser, ...updates });
      setUsers(users.map(u => u.id === currentUser.id ? { ...u, ...updates } : u));
      alert("Профиль обновлен!");
    } else {
      alert("Ошибка обновления профиля: " + error.message);
    }
  };

  const handlePhoneChange = (e) => {
    let val = e.target.value.replace(/\D/g, '');
    if (!val) { setProfilePhone(''); return; }
    
    // Форсируем начало с 7
    if (val.length > 0 && val[0] === '8') val = '7' + val.substring(1);
    else if (val.length > 0 && val[0] !== '7') val = '7' + val;

    let res = '+7';
    if (val.length > 1) res += ' (' + val.substring(1, 4);
    if (val.length >= 5) res += ') ' + val.substring(4, 7);
    if (val.length >= 8) res += '-' + val.substring(7, 9);
    if (val.length >= 10) res += '-' + val.substring(9, 11);
    
    setProfilePhone(res);
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (currentUser?.role !== 'Администратор') return;
    
    // Create the auth user securely as an admin
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: newUserEmail,
      password: newUserPassword,
      email_confirm: true
    });
    
    if (error) {
      alert("Ошибка при создании сотрудника: " + error.message);
      return;
    }
    
    // The DB trigger automatically creates a row in 'profiles'. 
    // We just need to update it with the name and role.
    if (data && data.user) {
      await supabaseAdmin.from('profiles').update({
        name: newUserName,
        role: newUserRole
      }).eq('id', data.user.id);
      
      alert("Сотрудник успешно создан и добавлен в базу!");
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserName('');
      fetchData(); // Refresh the users list
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    if (currentUser?.role !== 'Администратор') return;
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
    if (!error) {
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
    }
  };

  if (isLoadingAuth) return <div style={{padding:'2rem', color:'var(--text-primary)'}}>Загрузка авторизации...</div>;

  if (!session) {
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

  if (isDataLoading || !currentUser) {
    return <div style={{padding:'2rem', color:'var(--text-primary)'}}>Синхронизация профиля...</div>;
  }

  const activeProject = projects.find(p => p.id === activeProjectId);
  const projectStages = stages.filter(s => s.project_id === activeProjectId).sort((a, b) => a.order - b.order);
  const selectedTask = tasks.find(t => t.id === selectedTaskId);
  
  const getUserInitials = (name) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : '?';
  const getUser = (id) => users.find(u => u.id === id);

  const handlePanelDragStart = (e) => {
    if (e.target.tagName.toLowerCase() === 'button') return;
    setIsDraggingPanel(true);
    setPanelDragOffset({ x: e.clientX - panelPos.x, y: e.clientY - panelPos.y });
  };

  const handleSelectTask = (task) => {
    setSelectedTaskId(task.id);
    setEditName(task.name || '');
    setEditStatus(task.status || 'planned');
    setEditAssigneeId(task.assignee_id || '');
    setEditDate(task.date || '');
    setEditDesc(task.desc || '');
    setEditChecklist(task.checklist ? JSON.parse(JSON.stringify(task.checklist)) : []);
    setEditAttachments(task.attachments ? JSON.parse(JSON.stringify(task.attachments)) : []);
    setNewChecklistItemText('');
    setCommentText('');
    setIsDragOverDropZone(false);
  };

  const handleAddProject = async () => {
    if (currentUser.role !== 'Администратор' && currentUser.role !== 'Менеджер проектов') {
      alert('У вас нет прав для создания проектов');
      return;
    }
    const { data, error } = await supabase.from('projects').insert([{ name: 'Новый проект', status: 'В работе' }]).select();
    if (!error && data) {
      setProjects([...projects, data[0]]);
      setActiveProjectId(data[0].id);
    }
  };

  const handleCreateTask = async (stageId) => {
    const newTask = { stage_id: stageId, name: 'Новая задача', status: 'planned', assignee_id: currentUser.id, checklist: [], attachments: [], feed: [], is_modified: false };
    const { data, error } = await supabase.from('tasks').insert([newTask]).select();
    if (!error && data) {
      setTasks([...tasks, data[0]]);
      handleSelectTask(data[0]);
    }
  };

  const handleAddStage = async () => {
    if (!activeProjectId) return;
    const newOrder = projectStages.length > 0 ? projectStages[projectStages.length - 1].order + 1 : 1;
    const { data, error } = await supabase.from('stages').insert([{ project_id: activeProjectId, name: 'Новый этап', order: newOrder }]).select();
    if (!error && data) setStages([...stages, data[0]]);
  };

  const handleRenameStage = async (id, newName) => {
    setStages(stages.map(s => s.id === id ? { ...s, name: newName } : s));
    await supabase.from('stages').update({ name: newName }).eq('id', id);
  };

  const handleDragStartStage = (e, stageId) => {
    if (e.target.className.includes('stage-header') || e.target.closest('.stage-header')) {
      setDraggedStageId(stageId);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', stageId);
    } else {
      e.preventDefault();
    }
  };

  const handleDragOverStage = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };

  const handleDropStage = async (e, targetStageId) => {
    e.preventDefault();
    if (!draggedStageId || draggedStageId === targetStageId) { setDraggedStageId(null); return; }
    const currentProjectStages = stages.filter(s => s.project_id === activeProjectId).sort((a, b) => a.order - b.order);
    const draggedIdx = currentProjectStages.findIndex(s => s.id === draggedStageId);
    const targetIdx = currentProjectStages.findIndex(s => s.id === targetStageId);
    if (draggedIdx === -1 || targetIdx === -1) return;

    const newProjectStages = [...currentProjectStages];
    const [draggedItem] = newProjectStages.splice(draggedIdx, 1);
    newProjectStages.splice(targetIdx, 0, draggedItem);
    
    const updates = newProjectStages.map((s, index) => ({ id: s.id, project_id: s.project_id, name: s.name, order: index + 1 }));
    setStages(stages.map(s => s.project_id === activeProjectId ? { ...s, order: newProjectStages.findIndex(nps => nps.id === s.id) + 1 } : s));
    setDraggedStageId(null);
    await supabase.from('stages').upsert(updates);
  };

  const handleAddChecklistItem = () => {
    if (!newChecklistItemText.trim()) return;
    setEditChecklist([...editChecklist, { text: newChecklistItemText.trim(), done: false }]);
    setNewChecklistItemText('');
  };
  const handleToggleChecklistItem = (i) => setEditChecklist(editChecklist.map((c, idx) => idx === i ? {...c, done: !c.done} : c));
  const handleDeleteChecklistItem = (i) => setEditChecklist(editChecklist.filter((_, idx) => idx !== i));
  const handleFileDrop = (e) => { e.preventDefault(); setIsDragOverDropZone(false); if (e.dataTransfer.files) handleFiles(e.dataTransfer.files); };
  const handleFileInput = (e) => { if (e.target.files) handleFiles(e.target.files); };
  const handleFiles = (files) => {
    const newAttachments = Array.from(files).map(file => {
      let ext = file.name.split('.').pop().toUpperCase();
      return { id: `att_${Date.now()}_${Math.random()}`, name: file.name, size: file.size < 1024*1024 ? (file.size/1024).toFixed(1)+' KB' : (file.size/(1024*1024)).toFixed(1)+' MB', ext: ext.substring(0,3) };
    });
    setEditAttachments([...editAttachments, ...newAttachments]);
  };
  const handleDeleteAttachment = (id) => setEditAttachments(editAttachments.filter(a => a.id !== id));

  const handleUpdateTask = async () => {
    if (!selectedTask) return;
    let newFeedItems = [];
    if (editName !== selectedTask.name) newFeedItems.push({ id: Date.now(), type: 'history', authorId: currentUser.id, text: `Изменил(а) название`, date: 'Только что' });
    if (editStatus !== selectedTask.status) newFeedItems.push({ id: Date.now()+1, type: 'history', authorId: currentUser.id, text: `Изменил(а) статус на ${statusLabels[editStatus]}`, date: 'Только что' });
    if (editAssigneeId !== (selectedTask.assignee_id || '')) newFeedItems.push({ id: Date.now()+2, type: 'history', authorId: currentUser.id, text: `Изменил(а) ответственного`, date: 'Только что' });
    if (editDate !== (selectedTask.date || '')) newFeedItems.push({ id: Date.now()+3, type: 'history', authorId: currentUser.id, text: `Изменил(а) срок`, date: 'Только что' });
    
    const updatedFeed = [...(selectedTask.feed || []), ...newFeedItems];
    const updates = { name: editName, status: editStatus, assignee_id: editAssigneeId || null, date: editDate || null, desc: editDesc, checklist: editChecklist, attachments: editAttachments, is_modified: true, feed: updatedFeed };
    
    await supabase.from('tasks').update(updates).eq('id', selectedTask.id);
    setTasks(tasks.map(t => t.id === selectedTask.id ? { ...t, ...updates } : t));
  };

  const handleAddComment = async () => {
    if (!commentText.trim() || !selectedTask) return;
    const newComment = { id: Date.now(), type: 'comment', authorId: currentUser.id, text: commentText.trim(), date: 'Только что' };
    const updatedFeed = [...(selectedTask.feed || []), newComment];
    await supabase.from('tasks').update({ feed: updatedFeed }).eq('id', selectedTask.id);
    setTasks(tasks.map(t => t.id === selectedTask.id ? { ...t, feed: updatedFeed } : t));
    setCommentText('');
  };

  return (
    <div className="app-container">
      <header className="topbar">
        <div className="brand" onClick={() => setActiveView('map')} style={{cursor:'pointer'}}>Orbite Planing</div>
        
        <div style={{display: 'flex', alignItems: 'center', gap: '1rem'}}>
          {currentUser.role === 'Администратор' && (
            <button 
              className={`btn ${activeView === 'admin' ? 'active' : ''}`}
              style={{background: 'rgba(255,255,255,0.05)', border: '1px solid var(--panel-border)'}}
              onClick={() => setActiveView(activeView === 'admin' ? 'map' : 'admin')}
            >
              {activeView === 'admin' ? '← Назад к проектам' : '⚙ Админ-панель'}
            </button>
          )}

          <div 
            className="user-profile" 
            title="Личный кабинет" 
            onClick={() => setActiveView(activeView === 'profile' ? 'map' : 'profile')}
            style={{cursor: 'pointer'}}
          >
            <div className="user-info">
              <span className="user-name">{currentUser.name || currentUser.email}</span>
              <span className="user-role">{currentUser.role}</span>
            </div>
            <div className="avatar" style={{backgroundColor: currentUser.avatar_color || '#3b82f6'}}>
              {getUserInitials(currentUser.name || currentUser.email)}
            </div>
          </div>
          
          <button className="btn btn-icon" title="Выйти" onClick={handleLogout}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
          </button>
        </div>
      </header>

      <div className="main-area">
        {activeView === 'map' && (
          <aside className="glass-panel sidebar-left">
            <div className="panel-header">
              <h2>Проекты</h2>
              <button className="btn btn-icon" title="Создать проект" onClick={handleAddProject}>+</button>
            </div>
            <div className="panel-content">
              <div className="project-list">
                {projects.map(project => {
                  const projectTasks = tasks.filter(t => stages.some(s => s.project_id === project.id && s.id === t.stage_id));
                  const overdueCount = projectTasks.filter(t => t.status === 'overdue').length;
                  return (
                    <div key={project.id} className={`project-item ${activeProjectId === project.id ? 'active' : ''}`} onClick={() => { setActiveProjectId(project.id); setSelectedTaskId(null); }}>
                      <div className="project-name">{project.name}</div>
                      <div className="project-meta">
                        <span>{projectTasks.length} задач</span>
                        {overdueCount > 0 && <span style={{color: 'var(--status-overdue-text)'}}>{overdueCount} просрочено</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        )}

        <main className="glass-panel main-content">
          
          {/* PROFILE VIEW */}
          {activeView === 'profile' && (
            <>
              <div className="panel-header"><h2>Личный кабинет</h2></div>
              <div className="panel-content" style={{maxWidth: '500px'}}>
                <div className="detail-section">
                  <div className="detail-label">Ваш Email</div>
                  <input className="edit-select" value={currentUser.email} disabled style={{opacity: 0.5}} />
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
                  <div className="detail-label">Цвет профиля (аватар)</div>
                  <div style={{display:'flex', gap:'0.5rem', marginTop:'0.5rem'}}>
                    {['#3b82f6', '#ec4899', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444'].map(color => (
                      <div 
                        key={color} 
                        style={{width:'32px', height:'32px', borderRadius:'50%', backgroundColor: color, cursor:'pointer', border: profileAvatarColor === color ? '2px solid white' : '2px solid transparent'}}
                        onClick={() => setProfileAvatarColor(color)}
                      />
                    ))}
                  </div>
                </div>
                <button className="btn btn-primary" onClick={handleUpdateProfile}>Сохранить изменения</button>
              </div>
            </>
          )}

          {/* ADMIN VIEW */}
          {activeView === 'admin' && currentUser.role === 'Администратор' && (
            <>
              <div className="panel-header"><h2>Панель администратора</h2></div>
              <div className="panel-content" style={{display: 'flex', gap: '2rem'}}>
                
                <div style={{flex: 2}}>
                  <h3 style={{marginBottom: '1rem'}}>Пользователи системы</h3>
                  <table className="admin-table">
                    <thead>
                      <tr><th>Сотрудник</th><th>Email</th><th>Телефон</th><th>Роль в системе</th></tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u.id}>
                          <td>
                            <div style={{display:'flex', alignItems:'center', gap:'0.75rem'}}>
                              <div className="avatar sm" style={{backgroundColor: u.avatar_color || '#ccc'}}>{getUserInitials(u.name || u.email)}</div>
                              {u.name || 'Без имени'}
                              {u.id === currentUser.id && ' (Вы)'}
                            </div>
                          </td>
                          <td>{u.email}</td>
                          <td>{u.phone || '—'}</td>
                          <td>
                            <select 
                              className="edit-select" 
                              style={{marginBottom:0, height:'32px', width:'auto'}} 
                              value={u.role}
                              onChange={(e) => handleRoleChange(u.id, e.target.value)}
                              disabled={u.id === currentUser.id} // Нельзя понизить себя
                            >
                              <option value="Администратор">Администратор</option>
                              <option value="Менеджер проектов">Менеджер проектов</option>
                              <option value="Дизайнер">Дизайнер</option>
                              <option value="Разработчик">Разработчик</option>
                              <option value="Сотрудник">Сотрудник</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{flex: 1, borderLeft: '1px solid var(--panel-border)', paddingLeft: '2rem'}}>
                  <h3 style={{marginBottom: '1rem'}}>Регистрация нового сотрудника</h3>
                  <form onSubmit={handleCreateUser} style={{display:'flex', flexDirection:'column', gap: '1rem'}}>
                    <div>
                      <div className="detail-label">ФИО сотрудника</div>
                      <input className="auth-input" style={{marginBottom: 0}} type="text" placeholder="Алексей Смирнов" value={newUserName} onChange={e=>setNewUserName(e.target.value)} required />
                    </div>
                    <div>
                      <div className="detail-label">Email для входа</div>
                      <input className="auth-input" style={{marginBottom: 0}} type="email" placeholder="alex@orbite.com" value={newUserEmail} onChange={e=>setNewUserEmail(e.target.value)} required />
                    </div>
                    <div>
                      <div className="detail-label">Временный пароль</div>
                      <input className="auth-input" style={{marginBottom: 0}} type="password" placeholder="Пароль (минимум 6 символов)" value={newUserPassword} onChange={e=>setNewUserPassword(e.target.value)} required minLength={6} />
                    </div>
                    <div>
                      <div className="detail-label">Роль в системе</div>
                      <select className="edit-select" value={newUserRole} onChange={e=>setNewUserRole(e.target.value)}>
                        <option value="Сотрудник">Сотрудник</option>
                        <option value="Менеджер проектов">Менеджер проектов</option>
                        <option value="Дизайнер">Дизайнер</option>
                        <option value="Разработчик">Разработчик</option>
                        <option value="Администратор">Администратор</option>
                      </select>
                    </div>
                    <button className="btn btn-primary" type="submit">Создать аккаунт</button>
                  </form>
                </div>
                
              </div>
            </>
          )}

          {/* MAP VIEW */}
          {activeView === 'map' && (
            <>
              <div className="panel-header">
                <h2>{activeProject?.name || 'Выберите проект'}</h2>
                <div className="view-tabs">
                  <button className="view-tab active">Карта</button>
                </div>
              </div>
              <div className="panel-content">
                <div className="map-container">
                  {projectStages.map(stage => {
                    const stageTasks = tasks.filter(t => t.stage_id === stage.id);
                    return (
                      <div key={stage.id} className={`stage-column ${draggedStageId === stage.id ? 'dragging' : ''}`} onDragOver={handleDragOverStage} onDrop={(e) => handleDropStage(e, stage.id)}>
                        <div className="stage-header" draggable="true" onDragStart={(e) => handleDragStartStage(e, stage.id)}>
                          <div className="stage-title">
                            <input type="text" value={stage.name} onChange={(e) => handleRenameStage(stage.id, e.target.value)} style={{ background: 'transparent', border: 'none', color: 'inherit', fontWeight: 'inherit', fontSize: 'inherit', width: '100%', outline: 'none' }} />
                          </div>
                          <div className="stage-stats">{stageTasks.length} задач</div>
                        </div>
                        <div className="task-list">
                          {stageTasks.map(task => {
                            const assignee = getUser(task.assignee_id);
                            return (
                              <div key={task.id} className="task-card" data-status={task.status} onClick={() => handleSelectTask(task)}>
                                {task.is_modified && <div className="modified-indicator"></div>}
                                <div className="task-title">{task.name}</div>
                                <div className="task-meta">
                                  <span className={`status-badge ${task.status}`}>{statusLabels[task.status]}</span>
                                  <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem'}}>
                                    <span>{formatDate(task.date)}</span>
                                    {assignee && <div className="avatar sm" title={assignee.name || assignee.email} style={{backgroundColor: assignee.avatar_color}}>{getUserInitials(assignee.name || assignee.email)}</div>}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <button className="btn" style={{marginTop: '0.5rem', background: 'transparent', border: '1px dashed var(--panel-border)', color: 'var(--text-secondary)'}} onClick={() => handleCreateTask(stage.id)}>
                          + Добавить задачу
                        </button>
                      </div>
                    );
                  })}
                  <div className="add-stage-btn" onClick={handleAddStage}>+ Добавить этап</div>
                </div>
              </div>
            </>
          )}
        </main>

        <aside className="glass-panel sidebar-right" style={{ left: panelPos.x, top: panelPos.y, display: (selectedTask && activeView === 'map') ? 'flex' : 'none' }}>
          <div className="panel-header" onMouseDown={handlePanelDragStart}>
            <h2>Свойства задачи</h2>
            <button className="btn btn-icon" onClick={() => setSelectedTaskId(null)}>✕</button>
          </div>
          {selectedTask && (
            <div className="panel-content" style={{paddingBottom: '2rem'}}>
              <div className="detail-section">
                <div className="detail-label">Этап: {stages.find(s => s.id === selectedTask.stage_id)?.name}</div>
                <textarea className="edit-textarea" value={editName} onChange={(e) => setEditName(e.target.value)} style={{fontSize: '1.25rem', fontWeight: '600', padding: '0.25rem', border: '1px solid transparent', borderBottomColor: 'var(--panel-border)', borderRadius: '0', background: 'transparent', minHeight: '36px'}} />
              </div>

              <div className="detail-section" style={{display: 'flex', gap: '1rem'}}>
                <div style={{flex: 1}}>
                  <div className="detail-label">Статус</div>
                  <select className="edit-select" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                    <option value="planned">План</option>
                    <option value="in-progress">В работе</option>
                    <option value="review">Проверка</option>
                    <option value="done">Готово</option>
                    <option value="overdue">Просрочено</option>
                  </select>
                </div>
                <div style={{flex: 1}}>
                  <div className="detail-label">Срок</div>
                  <input type="date" className="edit-select" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
                </div>
              </div>

              <div className="detail-section">
                <div className="detail-label">Ответственный</div>
                <select className="edit-select" value={editAssigneeId} onChange={(e) => setEditAssigneeId(e.target.value)}>
                  <option value="">Не назначен</option>
                  {users.map(user => (
                    <option key={user.id} value={user.id}>{user.name || user.email}</option>
                  ))}
                </select>
              </div>

              <div className="detail-section">
                <div className="detail-label">Описание</div>
                <textarea className="edit-textarea" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Добавьте описание задачи..." />
              </div>

              <div className="detail-section">
                 <button className="btn btn-primary" style={{width: '100%'}} onClick={handleUpdateTask}>Сохранить изменения</button>
              </div>

            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default App;
