import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../supabaseClient';

const statusLabels = {
  'planned': 'План',
  'in-progress': 'В работе',
  'review': 'Проверка',
  'done': 'Готово',
  'overdue': 'Просрочено'
};

export default function TaskSidebar({ taskId, onClose, currentUser, users, stages, onTaskUpdated, onDragStart }) {
  const [task, setTask] = useState(null);
  const [subtasks, setSubtasks] = useState([]);
  const [comments, setComments] = useState([]);
  
  const [editName, setEditName] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editAssigneeId, setEditAssigneeId] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editDesc, setEditDesc] = useState('');
  
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [commentText, setCommentText] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (taskId) {
      loadTaskData(taskId);
    }
  }, [taskId]);

  const loadTaskData = async (id) => {
    setIsLoading(true);
    const [taskRes, subtasksRes, commentsRes] = await Promise.all([
      supabase.from('tasks').select('*').eq('id', id).single(),
      supabase.from('subtasks').select('*').eq('task_id', id).order('created_at', { ascending: true }),
      supabase.from('comments').select('*, author:profiles(*)').eq('task_id', id).order('created_at', { ascending: true })
    ]);

    if (taskRes.data) {
      setTask(taskRes.data);
      setEditName(taskRes.data.name || '');
      setEditStatus(taskRes.data.status || 'planned');
      setEditAssigneeId(taskRes.data.assignee_id || '');
      setEditDate(taskRes.data.date || '');
      setEditDesc(taskRes.data.desc || '');
    }
    if (subtasksRes.data) setSubtasks(subtasksRes.data);
    if (commentsRes.data) setComments(commentsRes.data);
    
    setIsLoading(false);
  };

  const handleUpdateTask = async () => {
    if (!task) return;
    const updates = { 
      name: editName, 
      status: editStatus, 
      assignee_id: editAssigneeId || null, 
      date: editDate || null, 
      desc: editDesc 
    };
    const { data, error } = await supabase.from('tasks').update(updates).eq('id', task.id).select();
    if (!error && data) {
      onTaskUpdated(data[0]);
      onClose(); // Закрываем панель после сохранения
    }
  };

  const handleAddSubtask = async () => {
    if (!newSubtaskTitle.trim() || !task) return;
    const newSubtask = { task_id: task.id, title: newSubtaskTitle.trim(), is_completed: false };
    const { data, error } = await supabase.from('subtasks').insert([newSubtask]).select();
    if (!error && data) {
      setSubtasks([...subtasks, data[0]]);
      setNewSubtaskTitle('');
    }
  };

  const handleToggleSubtask = async (subtask) => {
    const newStatus = !subtask.is_completed;
    const { error } = await supabase.from('subtasks').update({ is_completed: newStatus }).eq('id', subtask.id);
    if (!error) {
      setSubtasks(subtasks.map(s => s.id === subtask.id ? { ...s, is_completed: newStatus } : s));
    }
  };

  const handleDeleteSubtask = async (id) => {
    const { error } = await supabase.from('subtasks').delete().eq('id', id);
    if (!error) {
      setSubtasks(subtasks.filter(s => s.id !== id));
    }
  };

  const handleAddComment = async () => {
    if (!commentText.trim() || !task) return;
    const newComment = { task_id: task.id, author_id: currentUser.id, text: commentText.trim() };
    const { data, error } = await supabase.from('comments').insert([newComment]).select('*, author:profiles(*)');
    if (!error && data) {
      setComments([...comments, data[0]]);
      setCommentText('');
    }
  };

  if (isLoading) {
    return (
      <aside className="glass-panel sidebar-right" style={{ display: 'flex', padding: '2rem' }}>
        Загрузка задачи...
      </aside>
    );
  }

  return (
    <aside className="glass-panel sidebar-right" style={{ display: 'flex' }} onClick={(e) => e.stopPropagation()}>
      <div className="panel-header" onMouseDown={onDragStart} style={{cursor: 'move'}}>
        <h2>Свойства задачи</h2>
        <button className="btn btn-icon" onClick={onClose}>✕</button>
      </div>
      
      <div className="panel-content" style={{paddingBottom: '2rem'}}>
        <div className="detail-section">
          <div className="detail-label">Этап: {stages.find(s => s.id === task?.stage_id)?.name}</div>
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
          <button className="btn btn-primary" style={{width: '100%'}} onClick={handleUpdateTask}>Сохранить основные изменения</button>
        </div>

        {/* НОВЫЙ БЛОК: Подзадачи */}
        <div className="detail-section" style={{marginTop: '2rem'}}>
          <div className="detail-label" style={{borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.5rem', marginBottom: '1rem'}}>
            Подзадачи (Многоуровневая структура)
          </div>
          <div style={{display: 'flex', gap: '0.5rem', marginBottom: '1rem'}}>
            <input type="text" className="auth-input" style={{marginBottom: 0, flex: 1}} value={newSubtaskTitle} onChange={e => setNewSubtaskTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddSubtask()} placeholder="Название подзадачи..." />
            <button className="btn btn-primary" onClick={handleAddSubtask}>+</button>
          </div>
          <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
            {subtasks.map((st) => (
              <div key={st.id} style={{display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)'}}>
                <input type="checkbox" checked={st.is_completed} onChange={() => handleToggleSubtask(st)} />
                <span style={{flex: 1, textDecoration: st.is_completed ? 'line-through' : 'none', color: st.is_completed ? 'var(--text-secondary)' : 'var(--text-primary)'}}>{st.title}</span>
                <button className="btn btn-icon" onClick={() => handleDeleteSubtask(st.id)}>✕</button>
              </div>
            ))}
            {subtasks.length === 0 && <div style={{color: 'var(--text-secondary)', fontSize: '0.85rem'}}>Нет подзадач</div>}
          </div>
        </div>

        {/* НОВЫЙ БЛОК: Комментарии */}
        <div className="detail-section" style={{marginTop: '2rem'}}>
          <div className="detail-label" style={{borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.5rem', marginBottom: '1rem'}}>
            Обсуждение
          </div>
          <div style={{display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem'}}>
            {comments.map(c => (
              <div key={c.id} style={{background: 'rgba(255,255,255,0.05)', padding: '0.75rem', borderRadius: 'var(--radius-md)'}}>
                <div style={{fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem'}}>{c.author?.name || c.author?.email}</div>
                <div style={{fontSize: '0.9rem'}}>{c.text}</div>
              </div>
            ))}
            {comments.length === 0 && <div style={{color: 'var(--text-secondary)', fontSize: '0.85rem'}}>Нет комментариев</div>}
          </div>
          <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
            <textarea className="edit-textarea" value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Написать комментарий..." style={{minHeight: '60px'}} />
            <button className="btn btn-primary" onClick={handleAddComment} style={{alignSelf: 'flex-end'}}>Отправить</button>
          </div>
        </div>

      </div>
    </aside>
  );
}
