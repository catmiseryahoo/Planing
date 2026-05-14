import React, { useState, useEffect, useRef } from 'react';
import { supabase, supabaseAdmin } from './supabaseClient';
import AuthScreen from './components/Auth/AuthScreen';
import ProfilePanel from './components/Profile/ProfilePanel';
import TaskSidebar from './components/Task/TaskSidebar';
import GanttChart from './components/Map/GanttChart';
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

  const [projects, setProjects] = useState([]);
  const [stages, setStages] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [isDataLoading, setIsDataLoading] = useState(false);

  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activeView, setActiveView] = useState('map'); // map, profile, admin
  const [activeProjectView, setActiveProjectView] = useState('kanban'); // kanban, gantt
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

  // Admin Create User states
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState('Сотрудник');

  const [adminEditingUser, setAdminEditingUser] = useState(null);

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

  const handleLogout = async () => {
    await supabase.auth.signOut();
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
    return <AuthScreen />;
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

  const hasTaskChanges = () => {
    if (!selectedTask) return false;
    return editName !== (selectedTask.name || '') ||
           editStatus !== (selectedTask.status || 'planned') ||
           editAssigneeId !== (selectedTask.assignee_id || '') ||
           editDate !== (selectedTask.date || '') ||
           editDesc !== (selectedTask.desc || '') ||
           JSON.stringify(editChecklist) !== JSON.stringify(selectedTask.checklist || []) ||
           JSON.stringify(editAttachments) !== JSON.stringify(selectedTask.attachments || []);
  };

  const handleMapBackgroundClick = () => {
    if (selectedTaskId && !hasTaskChanges()) {
      setSelectedTaskId(null);
    }
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
      let previewUrl = null;
      if (file.type.startsWith('image/')) {
        previewUrl = URL.createObjectURL(file);
      }
      return { 
        id: `att_${Date.now()}_${Math.random()}`, 
        name: file.name, 
        size: file.size < 1024*1024 ? (file.size/1024).toFixed(1)+' KB' : (file.size/(1024*1024)).toFixed(1)+' MB', 
        ext: ext.substring(0,3),
        previewUrl
      };
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
    setSelectedTaskId(null);
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
            <div className="avatar" style={{backgroundColor: currentUser.avatar_color || '#3b82f6', backgroundImage: currentUser.avatar_url ? `url(${currentUser.avatar_url})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center'}}>
              {!currentUser.avatar_url && getUserInitials(currentUser.name || currentUser.email)}
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

        <main className="glass-panel main-content" onClick={handleMapBackgroundClick}>
          
          {/* PROFILE VIEW */}
          {activeView === 'profile' && (
            <ProfilePanel 
              currentUser={currentUser} 
              users={users} 
              setUsers={setUsers} 
              setCurrentUser={setCurrentUser} 
            />
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
                      <tr><th>Сотрудник</th><th>Email</th><th>Телефон</th><th>Действия</th></tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u.id}>
                          <td>
                            <div style={{display:'flex', alignItems:'center', gap:'0.75rem'}}>
                              {u.avatar_url ? (
                                <img src={u.avatar_url} alt="avatar" className="avatar sm" style={{objectFit: 'cover'}} />
                              ) : (
                                <div className="avatar sm" style={{backgroundColor: u.avatar_color || '#ccc'}}>{getUserInitials(u.name || u.email)}</div>
                              )}
                              {u.name || 'Без имени'}
                              {u.id === currentUser.id && ' (Вы)'}
                            </div>
                          </td>
                          <td>{u.email}</td>
                          <td>{u.phone || '—'}</td>
                          <td>
                            <button className="btn btn-icon" onClick={() => setAdminEditingUser(u)} title="Редактировать">✏️</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{flex: 1, borderLeft: '1px solid var(--panel-border)', paddingLeft: '2rem'}}>
                  {adminEditingUser ? (
                    <div>
                      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: '1rem'}}>
                        <h3>Редактирование: {adminEditingUser.name}</h3>
                        <button className="btn btn-icon" onClick={() => setAdminEditingUser(null)}>✕</button>
                      </div>
                      <div className="detail-section">
                        <div className="detail-label">ФИО</div>
                        <input className="edit-select" value={adminEditingUser.name || ''} onChange={e => setAdminEditingUser({...adminEditingUser, name: e.target.value})} />
                      </div>
                      <div className="detail-section">
                        <div className="detail-label">Телефон</div>
                        <input className="edit-select" value={adminEditingUser.phone || ''} onChange={e => setAdminEditingUser({...adminEditingUser, phone: e.target.value})} />
                      </div>
                      <div className="detail-section">
                        <div className="detail-label">Роль</div>
                        <select className="edit-select" value={adminEditingUser.role} onChange={e => setAdminEditingUser({...adminEditingUser, role: e.target.value})} disabled={adminEditingUser.id === currentUser.id}>
                          <option value="Администратор">Администратор</option>
                          <option value="Менеджер проектов">Менеджер проектов</option>
                          <option value="Дизайнер">Дизайнер</option>
                          <option value="Разработчик">Разработчик</option>
                          <option value="Сотрудник">Сотрудник</option>
                        </select>
                      </div>
                      <div className="detail-section">
                        <div className="detail-label">Фото сотрудника</div>
                        <div style={{display:'flex', gap:'1rem', alignItems:'center'}}>
                           {adminEditingUser.avatar_url ? (
                              <img src={adminEditingUser.avatar_url} alt="avatar" style={{width:'48px', height:'48px', borderRadius:'50%', objectFit:'cover', border:'2px solid var(--panel-border)'}} />
                           ) : (
                              <div style={{width:'48px', height:'48px', borderRadius:'50%', backgroundColor: adminEditingUser.avatar_color || '#ccc', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.2rem', fontWeight:'bold', color:'white'}}>
                                {getUserInitials(adminEditingUser.name || adminEditingUser.email)}
                              </div>
                           )}
                           <div style={{flex: 1}}>
                              <input type="file" accept="image/*" onChange={(e) => {
                                 if (e.target.files && e.target.files[0]) {
                                    const reader = new FileReader();
                                    reader.onload = (ev) => {
                                        setAdminEditingUser({...adminEditingUser, avatar_url: ev.target.result});
                                    };
                                    reader.readAsDataURL(e.target.files[0]);
                                 }
                              }} style={{fontSize:'0.8rem'}} />
                              <div style={{fontSize:'0.75rem', color:'var(--text-secondary)', marginTop:'0.25rem'}}>Или цвет (если нет фото):</div>
                              <div style={{display:'flex', gap:'0.25rem', marginTop:'0.25rem'}}>
                                {['#3b82f6', '#ec4899', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444'].map(color => (
                                  <div key={color} style={{width:'20px', height:'20px', borderRadius:'50%', backgroundColor: color, cursor:'pointer', border: adminEditingUser.avatar_color === color ? '2px solid white' : '2px solid transparent'}} onClick={() => setAdminEditingUser({...adminEditingUser, avatar_color: color, avatar_url: ''})} />
                                ))}
                              </div>
                           </div>
                        </div>
                      </div>
                      <button className="btn btn-primary" onClick={async () => {
                          const { id, name, phone, role, avatar_color, avatar_url } = adminEditingUser;
                          const { error } = await supabase.from('profiles').update({ name, phone, role, avatar_color, avatar_url }).eq('id', id);
                          if (!error) {
                             setUsers(users.map(u => u.id === id ? adminEditingUser : u));
                             if (id === currentUser.id) setCurrentUser({...currentUser, name, phone, role, avatar_color, avatar_url});
                             setAdminEditingUser(null);
                          } else {
                             alert('Ошибка: ' + error.message);
                          }
                      }}>Сохранить сотрудника</button>
                    </div>
                  ) : (
                    <div>
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
                  )}
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
                  <button className={`view-tab ${activeProjectView === 'kanban' ? 'active' : ''}`} onClick={() => setActiveProjectView('kanban')}>Канбан (Карта)</button>
                  <button className={`view-tab ${activeProjectView === 'gantt' ? 'active' : ''}`} onClick={() => setActiveProjectView('gantt')}>Диаграмма Ганта</button>
                </div>
              </div>
              <div className="panel-content" style={activeProjectView === 'gantt' ? { padding: 0, overflow: 'hidden' } : {}}>
                {activeProjectView === 'kanban' && (
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
                                <div key={task.id} className="task-card" data-status={task.status} onClick={(e) => { e.stopPropagation(); handleSelectTask(task); }}>
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
                )}
                {activeProjectView === 'gantt' && (
                  <GanttChart 
                    tasks={tasks.filter(t => projectStages.some(s => s.id === t.stage_id))} 
                    stages={projectStages} 
                    onSelectTask={(task) => handleSelectTask(task)} 
                  />
                )}
              </div>
            </>
          )}
        </main>

        {(selectedTask && activeView === 'map') && (
           <div style={{ position: 'absolute', left: panelPos.x, top: panelPos.y, zIndex: 100, display: 'flex' }}>
              <TaskSidebar 
                taskId={selectedTask.id} 
                onClose={() => setSelectedTaskId(null)} 
                currentUser={currentUser} 
                users={users} 
                stages={stages} 
                onTaskUpdated={(updatedTask) => setTasks(tasks.map(t => t.id === updatedTask.id ? updatedTask : t))} 
                onDragStart={handlePanelDragStart}
              />
           </div>
        )}
      </div>
    </div>
  );
}

export default App;
