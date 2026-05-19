import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient';
import DatePicker from '../UI/DatePicker';

const TASK_FILE_BUCKET = 'task-files';

const statusLabels = {
  'planned': 'План',
  'in-progress': 'В работе',
  'review': 'Проверка',
  'done': 'Готово',
  'overdue': 'Просрочено'
};

export default function TaskSidebar({ taskId, onClose, currentUser, users, stages, onTaskUpdated, onTaskDeleted, onTaskFileAdded, onTaskFileDeleted, onDragStart }) {
  const [task, setTask] = useState(null);
  const [subtasks, setSubtasks] = useState([]);
  const [comments, setComments] = useState([]);
  const [files, setFiles] = useState([]);
  
  const [editName, setEditName] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editAssigneeId, setEditAssigneeId] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editDesc, setEditDesc] = useState('');
  
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [commentText, setCommentText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [isDragOverFiles, setIsDragOverFiles] = useState(false);
  const fileInputRef = useRef(null);

  const loadTaskData = useCallback(async (id) => {
    setIsLoading(true);
    const [taskRes, subtasksRes, commentsRes, filesRes] = await Promise.all([
      supabase.from('tasks').select('*').eq('id', id).single(),
      supabase.from('subtasks').select('*').eq('task_id', id).order('created_at', { ascending: true }),
      supabase.from('comments').select('*, author:profiles(*)').eq('task_id', id).order('created_at', { ascending: true }),
      supabase.from('task_files').select('*').eq('task_id', id).order('created_at', { ascending: true })
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
    if (filesRes.data) setFiles(filesRes.data);
    
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!taskId) return undefined;
    const timeoutId = window.setTimeout(() => loadTaskData(taskId), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadTaskData, taskId]);

  const getUserName = (userId) => {
    if (!userId) return 'Не назначен';
    const user = users.find(item => item.id === userId);
    return user?.name || user?.email || 'Не назначен';
  };

  const buildTaskChanges = (updates) => {
    const fields = [
      { key: 'name', label: 'Название', before: task.name || '', after: updates.name || '' },
      { key: 'status', label: 'Статус', before: task.status || 'planned', after: updates.status || 'planned', format: value => statusLabels[value] || value },
      { key: 'assignee_id', label: 'Ответственный', before: task.assignee_id || '', after: updates.assignee_id || '', format: getUserName },
      { key: 'date', label: 'Срок', before: task.date || '', after: updates.date || '', format: value => value || 'Не задан' },
      { key: 'desc', label: 'Описание', before: task.desc || '', after: updates.desc || '', format: value => value || 'Пусто' }
    ];

    return fields
      .filter(field => String(field.before ?? '') !== String(field.after ?? ''))
      .map(field => ({
        field: field.key,
        label: field.label,
        from: field.format ? field.format(field.before) : field.before,
        to: field.format ? field.format(field.after) : field.after
      }));
  };

  const handleUpdateTask = async () => {
    if (!task) return;
    const hasPendingComment = Boolean(commentText.trim());
    const hasPendingSubtask = Boolean(newSubtaskTitle.trim());
    
    // Сохраняем не отправленный комментарий, если он есть
    if (hasPendingComment) {
      await handleAddComment();
    }
    
    // Сохраняем не добавленную подзадачу, если она есть
    if (hasPendingSubtask) {
      await handleAddSubtask();
    }

    const updates = { 
      name: editName, 
      status: editStatus, 
      assignee_id: editAssigneeId || null, 
      date: editDate || null, 
      desc: editDesc 
    };
    const changes = buildTaskChanges(updates);
    const { data, error } = await supabase.from('tasks').update(updates).eq('id', task.id).select();
    if (!error && data) {
      onTaskUpdated(data[0], {
        subtask_count: subtasks.length + (hasPendingSubtask ? 1 : 0),
        comment_count: comments.length + (hasPendingComment ? 1 : 0),
        file_count: files.length,
        is_modified: true
      }, changes.length > 0 ? { changes } : null);
      onClose(); // Закрываем панель после сохранения
    }
  };

  const handleAddSubtask = async () => {
    if (!newSubtaskTitle.trim() || !task) return;
    const newSubtask = { task_id: task.id, title: newSubtaskTitle.trim(), is_completed: false };
    const { data, error } = await supabase.from('subtasks').insert([newSubtask]).select();
    if (error) {
      alert('Ошибка добавления подзадачи: ' + error.message);
      return;
    }
    if (!error && data) {
      setSubtasks([...subtasks, data[0]]);
      onTaskUpdated(task, { subtask_count: subtasks.length + 1, is_modified: true }, {
        action: 'add_subtask',
        entityType: 'subtask',
        entityId: data[0].id,
        entityName: data[0].title
      });
      setNewSubtaskTitle('');
    }
  };

  const handleToggleSubtask = async (subtask) => {
    const newStatus = !subtask.is_completed;
    const { error } = await supabase.from('subtasks').update({ is_completed: newStatus }).eq('id', subtask.id);
    if (error) {
      alert('Ошибка обновления подзадачи: ' + error.message);
      return;
    }
    if (!error) {
      setSubtasks(subtasks.map(s => s.id === subtask.id ? { ...s, is_completed: newStatus } : s));
      onTaskUpdated(task, { is_modified: true }, {
        action: 'update_subtask',
        entityType: 'subtask',
        entityId: subtask.id,
        entityName: subtask.title,
        details: {
          changes: [{ label: 'Статус', from: subtask.is_completed ? 'Готово' : 'Не готово', to: newStatus ? 'Готово' : 'Не готово' }]
        }
      });
    }
  };

  const handleDeleteSubtask = async (id) => {
    const removedSubtask = subtasks.find(subtask => subtask.id === id);
    const { error } = await supabase.from('subtasks').delete().eq('id', id);
    if (error) {
      alert('Ошибка удаления подзадачи: ' + error.message);
      return;
    }
    if (!error) {
      setSubtasks(subtasks.filter(s => s.id !== id));
      onTaskUpdated(task, { subtask_count: Math.max(0, subtasks.length - 1), is_modified: true }, {
        action: 'delete_subtask',
        entityType: 'subtask',
        entityId: id,
        entityName: removedSubtask?.title || 'Подзадача'
      });
    }
  };

  const handleDeleteTask = async () => {
    if (!task || currentUser?.role !== 'Администратор') return;
    if (!window.confirm(`Удалить задачу "${task.name}"?`)) return;

    const { error } = await supabase.from('tasks').delete().eq('id', task.id);
    if (error) {
      alert('Ошибка удаления задачи: ' + error.message);
      return;
    }

    onTaskDeleted(task.id);
    onClose();
  };

  const handleAddComment = async () => {
    if (!commentText.trim() || !task) return;
    const newComment = { task_id: task.id, author_id: currentUser.id, text: commentText.trim() };
    const { data, error } = await supabase.from('comments').insert([newComment]).select('*, author:profiles(*)');
    if (!error && data) {
      setComments([...comments, data[0]]);
      onTaskUpdated(task, { comment_count: comments.length + 1, is_modified: true }, {
        action: 'add_comment',
        entityType: 'comment',
        entityId: data[0].id,
        entityName: newComment.text
      });
      setCommentText('');
    }
  };

  const handleUploadFiles = async (fileList) => {
    if (!task || !fileList?.length) return;
    setIsUploadingFiles(true);

    try {
      for (const file of Array.from(fileList)) {
        const safeName = file.name.replace(/[^\w.\-а-яА-ЯёЁ ]/g, '_');
        const filePath = `${task.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from(TASK_FILE_BUCKET)
          .upload(filePath, file, { upsert: false });

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        const { data: publicUrlData } = supabase.storage
          .from(TASK_FILE_BUCKET)
          .getPublicUrl(filePath);

        const { data, error: insertError } = await supabase
          .from('task_files')
          .insert([{
            task_id: task.id,
            uploader_id: currentUser.id,
            file_name: file.name,
            file_url: publicUrlData.publicUrl,
            file_size: file.size
          }])
          .select();

        if (insertError) {
          throw new Error(insertError.message);
        }

        if (data?.[0]) {
          setFiles(currentFiles => [...currentFiles, data[0]]);
          onTaskFileAdded(data[0]);
          onTaskUpdated(task, { file_count: files.length + 1 });
        }
      }
    } catch (error) {
      alert('Ошибка загрузки файла: ' + error.message + '. Проверьте bucket task-files и политики Storage.');
    } finally {
      setIsUploadingFiles(false);
      setIsDragOverFiles(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteFile = async (file) => {
    if (!window.confirm(`Удалить файл "${file.file_name}"?`)) return;

    const { error } = await supabase.from('task_files').delete().eq('id', file.id);
    if (error) {
      alert('Ошибка удаления файла: ' + error.message);
      return;
    }

    setFiles(files.filter(f => f.id !== file.id));
    onTaskFileDeleted(file.id);
    onTaskUpdated(task, { file_count: Math.max(0, files.length - 1) });
  };

  const formatFileSize = (size) => {
    if (!size) return '';
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isImageFile = (file) => {
    return /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(file.file_name || file.file_url || '');
  };

  if (isLoading) {
    return (
      <aside className="glass-panel sidebar-right" style={{ display: 'flex', padding: '2rem' }}>
        Загрузка задачи...
      </aside>
    );
  }

  const taskStage = stages.find(s => s.id === task?.stage_id);

  return (
    <aside className="glass-panel sidebar-right task-stage-panel" style={{ display: 'flex', '--task-stage-color': taskStage?.color || '#3b82f6' }} onClick={(e) => e.stopPropagation()}>
      <div className="panel-header" onMouseDown={onDragStart} style={{cursor: 'move'}}>
        <h2>Свойства задачи</h2>
        <div style={{display: 'flex', alignItems: 'center', gap: '0.25rem'}} onMouseDown={(e) => e.stopPropagation()}>
          {currentUser?.role === 'Администратор' && (
            <button className="btn btn-icon danger" title="Удалить задачу" onClick={handleDeleteTask}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18" />
                <path d="M8 6V4h8v2" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v5" />
                <path d="M14 11v5" />
              </svg>
            </button>
          )}
          <button className="btn btn-icon close-panel-btn" onClick={onClose}>✕</button>
        </div>
      </div>
      
      <div className="panel-content" style={{paddingBottom: '2rem'}}>
        <div className="detail-section">
          <div className="detail-label">
            Этап: <span className="task-stage-chip" style={{backgroundColor: taskStage?.color || '#3b82f6'}}></span>{taskStage?.name}
          </div>
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
            <DatePicker value={editDate} onChange={(val) => setEditDate(val)} popupAlign="right" />
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

        <div className="detail-section" style={{marginTop: '2rem'}}>
          <div className="detail-label" style={{borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.5rem', marginBottom: '1rem'}}>
            Файлы и медиа
          </div>
          <div
            className={`file-drop-zone ${isDragOverFiles ? 'dragover' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragOverFiles(true); }}
            onDragLeave={() => setIsDragOverFiles(false)}
            onDrop={(e) => {
              e.preventDefault();
              handleUploadFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={(e) => handleUploadFiles(e.target.files)}
              style={{display: 'none'}}
            />
            {isUploadingFiles ? 'Загрузка...' : 'Перетащите файлы сюда или нажмите для выбора'}
          </div>
          <div className="task-file-list">
            {files.map(file => (
              <div key={file.id} className="task-file-item">
                {isImageFile(file) && (
                  <a href={file.file_url} target="_blank" rel="noreferrer" className="task-file-preview">
                    <img src={file.file_url} alt={file.file_name} />
                  </a>
                )}
                <div className="task-file-info">
                  <a href={file.file_url} target="_blank" rel="noreferrer" className="task-file-name">{file.file_name}</a>
                  <span className="task-file-size">{formatFileSize(file.file_size)}</span>
                </div>
                <button className="btn btn-icon danger" title="Удалить файл" onClick={() => handleDeleteFile(file)}>✕</button>
              </div>
            ))}
            {files.length === 0 && <div style={{color: 'var(--text-secondary)', fontSize: '0.85rem'}}>Нет файлов</div>}
          </div>
        </div>

        {/* НОВЫЙ БЛОК: Подзадачи */}
        <div className="detail-section" style={{marginTop: '2rem'}}>
          <div className="detail-label" style={{borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.5rem', marginBottom: '1rem'}}>
            Подзадачи (Многоуровневая структура)
          </div>
          <div style={{display: 'flex', gap: '0.5rem', marginBottom: '1rem'}}>
            <input type="text" className="auth-input" style={{marginBottom: 0, flex: 1}} value={newSubtaskTitle} onChange={e => setNewSubtaskTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddSubtask()} placeholder="Название подзадачи..." />
            <button className="btn" style={{background: 'rgba(255,255,255,0.1)', color: 'white'}} onClick={handleAddSubtask}>Добавить</button>
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
          </div>
        </div>

        <div className="detail-section" style={{marginTop: '2rem'}}>
          <button className="btn btn-primary" style={{width: '100%', padding: '1rem', fontSize: '1rem'}} onClick={handleUpdateTask}>Сохранить все изменения и закрыть</button>
        </div>

      </div>
    </aside>
  );
}
