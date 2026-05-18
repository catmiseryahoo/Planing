import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
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

const countByTaskId = (items) => {
  return (items || []).reduce((acc, item) => {
    if (!item.task_id) return acc;
    acc[item.task_id] = (acc[item.task_id] || 0) + 1;
    return acc;
  }, {});
};

const getDateOnly = (dateString) => {
  if (!dateString) return null;
  const date = new Date(`${dateString}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getCompletionPercent = (items) => {
  if (!items.length) return 0;
  const doneCount = items.filter(task => task.status === 'done').length;
  return Math.round((doneCount / items.length) * 100);
};

const formatFileSize = (size) => {
  if (!size) return '';
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const logActionLabels = {
  create_stage: 'создал этап',
  update_stage: 'изменил этап',
  delete_stage: 'удалил этап',
  create_task: 'создал задачу',
  update_task: 'изменил задачу',
  delete_task: 'удалил задачу',
  add_subtask: 'добавил подзадачу',
  update_subtask: 'изменил подзадачу',
  delete_subtask: 'удалил подзадачу',
  add_comment: 'добавил комментарий',
  upload_file: 'добавил файл',
  delete_file: 'удалил файл',
  update_project: 'изменил проект',
  add_member: 'добавил сотрудника',
  update_member: 'изменил роль сотрудника',
  remove_member: 'удалил сотрудника'
};

const isImageFile = (file) => {
  return /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(file?.file_name || file?.file_url || '');
};

const getProjectMetrics = (projectStages, projectTasks) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const total = projectTasks.length;
  const done = projectTasks.filter(task => task.status === 'done').length;
  const overdue = projectTasks.filter(task => {
    const due = getDateOnly(task.date || task.due_date);
    return task.status !== 'done' && (task.status === 'overdue' || (due && due < today));
  }).length;
  const dueSoon = projectTasks.filter(task => {
    const due = getDateOnly(task.date || task.due_date);
    if (!due || task.status === 'done') return false;
    const daysLeft = Math.ceil((due.getTime() - today.getTime()) / 86400000);
    return daysLeft >= 0 && daysLeft <= 2;
  }).length;
  const datedTasks = projectTasks.filter(task => getDateOnly(task.date || task.due_date));
  const shouldBeDone = datedTasks.filter(task => getDateOnly(task.date || task.due_date) <= today).length;
  const actualProgress = getCompletionPercent(projectTasks);
  const plannedProgress = datedTasks.length ? Math.round((shouldBeDone / datedTasks.length) * 100) : actualProgress;
  const lag = plannedProgress - actualProgress;

  const stageSummaries = projectStages.map(stage => {
    const stageTasks = projectTasks.filter(task => task.stage_id === stage.id);
    return {
      ...stage,
      taskCount: stageTasks.length,
      doneCount: stageTasks.filter(task => task.status === 'done').length,
      progress: getCompletionPercent(stageTasks),
      activeCount: stageTasks.filter(task => ['in-progress', 'review', 'overdue'].includes(task.status)).length
    };
  });

  let health = { key: 'on-track', label: 'В графике' };
  if (total > 0 && actualProgress === 100) {
    health = { key: 'complete', label: 'Готово' };
  } else if (overdue > 0 || lag > 15) {
    health = { key: 'off-track', label: 'Проблема' };
  } else if (dueSoon > 0 || lag > 5) {
    health = { key: 'at-risk', label: 'Риск' };
  }

  const currentStage =
    health.key === 'complete'
      ? stageSummaries[stageSummaries.length - 1]
      : stageSummaries.find(stage => stage.taskCount > 0 && stage.progress < 100 && stage.activeCount > 0) ||
        stageSummaries.find(stage => stage.taskCount > 0 && stage.progress < 100) ||
        stageSummaries[0];

  return {
    total,
    done,
    overdue,
    dueSoon,
    actualProgress,
    plannedProgress,
    lag: Math.max(0, lag),
    health,
    currentStage,
    stageSummaries
  };
};

const ProjectMemberIcon = ({ type }) => {
  const commonProps = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
  };

  if (type === 'mail') {
    return (
      <svg {...commonProps} aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
    );
  }

  if (type === 'phone') {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.32 1.77.6 2.61a2 2 0 0 1-.45 2.11L8 9.7a16 16 0 0 0 6.3 6.3l1.26-1.26a2 2 0 0 1 2.11-.45c.84.28 1.71.48 2.61.6A2 2 0 0 1 22 16.92Z" />
      </svg>
    );
  }

  if (type === 'telegram') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M21.7 4.3c.3-1-.6-1.8-1.5-1.4L2.9 9.6c-1.2.5-1.2 2.1.1 2.5l4.4 1.4 1.7 5.2c.4 1.1 1.8 1.3 2.4.4l2.4-3.4 4.6 3.3c.9.6 2.1.1 2.3-1l2.9-13.7Zm-4.1 2.4-8.2 7.2-.3 3.2-1.1-3.5 9.6-6.9Z" />
      </svg>
    );
  }

  if (type === 'role') {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3v8Z" />
        <path d="M9 12l2 2 4-5" />
      </svg>
    );
  }

  return (
    <svg {...commonProps} aria-hidden="true">
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18" />
      <path d="M9 16h.01" />
      <path d="M13 16h.01" />
    </svg>
  );
};

function App() {
  const [session, setSession] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  const [projects, setProjects] = useState([]);
  const [stages, setStages] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [taskFiles, setTaskFiles] = useState([]);
  const [projectMembers, setProjectMembers] = useState([]);
  const [projectLogs, setProjectLogs] = useState([]);
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
  const [memberUserId, setMemberUserId] = useState('');
  const [memberRole, setMemberRole] = useState('Участник');

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
      const [projectsRes, stagesRes, tasksRes, profilesRes, subtasksRes, commentsRes, filesRes, membersRes, logsRes] = await Promise.all([
        supabase.from('projects').select('*').order('created_at', { ascending: true }),
        supabase.from('stages').select('*').order('order', { ascending: true }),
        supabase.from('tasks').select('*'),
        supabase.from('profiles').select('*'),
        supabase.from('subtasks').select('task_id'),
        supabase.from('comments').select('task_id'),
        supabase.from('task_files').select('*').order('created_at', { ascending: false }),
        supabase.from('project_members').select('*'),
        supabase.from('project_logs').select('*').order('created_at', { ascending: false }).limit(300)
      ]);

      const subtaskCounts = countByTaskId(subtasksRes.data);
      const commentCounts = countByTaskId(commentsRes.data);
      const fileCounts = countByTaskId(filesRes.data);
      const tasksWithIndicators = (tasksRes.data || []).map(task => ({
        ...task,
        subtask_count: subtaskCounts[task.id] || 0,
        comment_count: commentCounts[task.id] || 0,
        file_count: fileCounts[task.id] || 0
      }));

      setProjects(projectsRes.data || []);
      setStages(stagesRes.data || []);
      setTasks(tasksWithIndicators);
      setUsers(profilesRes.data || []);
      setTaskFiles(filesRes.data || []);
      setProjectMembers(membersRes.data || []);
      setProjectLogs(logsRes.data || []);

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

    const { error } = await supabase.functions.invoke('create-user', {
      body: {
        email: newUserEmail,
        password: newUserPassword,
        name: newUserName,
        role: newUserRole
      }
    });

    if (error) {
      alert("Ошибка при создании сотрудника: " + error.message);
      return;
    }

    alert("Сотрудник успешно создан и добавлен в базу!");
    setNewUserEmail('');
    setNewUserPassword('');
    setNewUserName('');
    fetchData();
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
  const projectTasks = tasks.filter(t => projectStages.some(s => s.id === t.stage_id));
  const projectMetrics = getProjectMetrics(projectStages, projectTasks);
  const selectedTask = tasks.find(t => t.id === selectedTaskId);
  const projectTaskIds = new Set(projectTasks.map(task => task.id));
  const projectFiles = taskFiles.filter(file => projectTaskIds.has(file.task_id));
  const activeProjectMembers = projectMembers.filter(member => member.project_id === activeProjectId);
  const activeProjectLogs = projectLogs.filter(log => log.project_id === activeProjectId);
  const isProjectLead = activeProjectMembers.some(member => member.user_id === currentUser.id && member.role === 'Руководитель проекта');
  const canManageProjectMembers = currentUser.role === 'Администратор' || isProjectLead;
  
  const getUserInitials = (name) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : '?';
  const getUser = (id) => users.find(u => u.id === id);

  const appendProjectLog = async ({ projectId = activeProjectId, action, entityType, entityId, entityName, details = {} }) => {
    if (!projectId || !currentUser?.id) return;

    const payload = {
      project_id: projectId,
      actor_id: currentUser.id,
      action,
      entity_type: entityType,
      entity_id: entityId,
      entity_name: entityName,
      details
    };
    const { data, error } = await supabase.from('project_logs').insert([payload]).select();
    if (!error && data?.[0]) {
      setProjectLogs([data[0], ...projectLogs]);
    }
  };

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
    const { data, error } = await supabase.from('projects').insert([{ name: 'Новый проект', status: 'В работе', color: '#3b82f6' }]).select();
    if (!error && data) {
      setProjects([...projects, data[0]]);
      setActiveProjectId(data[0].id);
      appendProjectLog({
        projectId: data[0].id,
        action: 'create_project',
        entityType: 'project',
        entityId: data[0].id,
        entityName: data[0].name
      });
    }
  };

  const handleAddProjectMember = async (e) => {
    e.preventDefault();
    if (!activeProjectId || !memberUserId || !canManageProjectMembers) return;

    const { data, error } = await supabase
      .from('project_members')
      .upsert([{ project_id: activeProjectId, user_id: memberUserId, role: memberRole }], { onConflict: 'project_id,user_id' })
      .select();

    if (error) {
      alert('Ошибка добавления сотрудника в проект: ' + error.message);
      return;
    }

    if (data?.[0]) {
      setProjectMembers([
        ...projectMembers.filter(member => !(member.project_id === activeProjectId && member.user_id === memberUserId)),
        data[0]
      ]);
      const user = getUser(memberUserId);
      appendProjectLog({
        action: 'add_member',
        entityType: 'member',
        entityId: data[0].id,
        entityName: user?.name || user?.email,
        details: { role: memberRole }
      });
      setMemberUserId('');
      setMemberRole('Участник');
    }
  };

  const handleProjectMemberRoleChange = async (member, role) => {
    if (!canManageProjectMembers) return;
    const { data, error } = await supabase
      .from('project_members')
      .update({ role })
      .eq('id', member.id)
      .select();

    if (error) {
      alert('Ошибка изменения роли участника: ' + error.message);
      return;
    }

    if (data?.[0]) {
      setProjectMembers(projectMembers.map(item => item.id === member.id ? data[0] : item));
      const user = getUser(member.user_id);
      appendProjectLog({
        action: 'update_member',
        entityType: 'member',
        entityId: member.id,
        entityName: user?.name || user?.email,
        details: { changes: [{ field: 'role', label: 'Роль', from: member.role || 'Участник', to: role }] }
      });
    }
  };

  const handleDeleteProjectMember = async (member) => {
    if (!canManageProjectMembers) return;
    const user = getUser(member.user_id);
    if (!window.confirm(`Удалить ${user?.name || user?.email || 'сотрудника'} из проекта?`)) return;

    const { error } = await supabase.from('project_members').delete().eq('id', member.id);
    if (error) {
      alert('Ошибка удаления участника проекта: ' + error.message);
      return;
    }

    setProjectMembers(projectMembers.filter(item => item.id !== member.id));
    appendProjectLog({
      action: 'remove_member',
      entityType: 'member',
      entityId: member.id,
      entityName: user?.name || user?.email
    });
  };

  const handleDeleteProject = async (id) => {
    if (!window.confirm("Удалить проект и все его задачи?")) return;
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (!error) {
      setProjects(projects.filter(p => p.id !== id));
      if (activeProjectId === id) setActiveProjectId(null);
    }
  };

  const handleProjectColorChange = async (project, color) => {
    if (!project || project.color === color) return;
    if (currentUser?.role !== 'Администратор' && currentUser?.role !== 'Менеджер проектов') {
      alert('У вас нет прав для изменения проекта');
      return;
    }

    const previousColor = project.color || '#3b82f6';
    setProjects(projects.map(item => item.id === project.id ? { ...item, color } : item));

    const { error } = await supabase.from('projects').update({ color }).eq('id', project.id);
    if (error) {
      setProjects(projects);
      alert('Ошибка изменения цвета проекта: ' + error.message);
      return;
    }

    appendProjectLog({
      projectId: project.id,
      action: 'update_project',
      entityType: 'project',
      entityId: project.id,
      entityName: project.name,
      details: { changes: [{ field: 'color', label: 'Цвет проекта', from: previousColor, to: color }] }
    });
  };

  const handleDeleteStage = async (stage) => {
    if (currentUser?.role !== 'Администратор') return;
    const stageTasks = tasks.filter(t => t.stage_id === stage.id);
    const taskText = stageTasks.length ? ` и ${stageTasks.length} задач внутри` : '';
    if (!window.confirm(`Удалить этап "${stage.name}"${taskText}?`)) return;

    const { error } = await supabase.from('stages').delete().eq('id', stage.id);
    if (error) {
      alert('Ошибка удаления этапа: ' + error.message);
      return;
    }

    setStages(stages.filter(s => s.id !== stage.id));
    setTasks(tasks.filter(t => t.stage_id !== stage.id));
    appendProjectLog({
      action: 'delete_stage',
      entityType: 'stage',
      entityId: stage.id,
      entityName: stage.name,
      details: { taskCount: stageTasks.length }
    });
    if (selectedTask && selectedTask.stage_id === stage.id) {
      setSelectedTaskId(null);
    }
  };

  const handleDeleteTask = async (task) => {
    if (currentUser?.role !== 'Администратор') return;
    if (!window.confirm(`Удалить задачу "${task.name}"?`)) return;

    const { error } = await supabase.from('tasks').delete().eq('id', task.id);
    if (error) {
      alert('Ошибка удаления задачи: ' + error.message);
      return;
    }

    setTasks(tasks.filter(t => t.id !== task.id));
    appendProjectLog({
      action: 'delete_task',
      entityType: 'task',
      entityId: task.id,
      entityName: task.name
    });
    if (selectedTaskId === task.id) {
      setSelectedTaskId(null);
    }
  };

  const handleCreateTask = async (stageId) => {
    const newTask = { stage_id: stageId, name: 'Новая задача', status: 'planned', assignee_id: currentUser.id, checklist: [], attachments: [], feed: [], is_modified: false };
    const { data, error } = await supabase.from('tasks').insert([newTask]).select();
    if (!error && data) {
      setTasks([...tasks, { ...data[0], subtask_count: 0, comment_count: 0, file_count: 0 }]);
      const stage = stages.find(s => s.id === stageId);
      appendProjectLog({
        projectId: stage?.project_id,
        action: 'create_task',
        entityType: 'task',
        entityId: data[0].id,
        entityName: data[0].name
      });
      handleSelectTask(data[0]);
    }
  };

  const handleAddStage = async () => {
    if (!activeProjectId) return;
    const name = prompt("Введите название этапа:");
    if (!name) return;
    const newOrder = projectStages.length > 0 ? projectStages[projectStages.length - 1].order + 1 : 1;
    const newStage = { project_id: activeProjectId, name, order: newOrder };
    const { data, error } = await supabase.from('stages').insert([newStage]).select();
    if (!error && data) {
      setStages([...stages, data[0]]);
      appendProjectLog({
        action: 'create_stage',
        entityType: 'stage',
        entityId: data[0].id,
        entityName: data[0].name
      });
    }
  };

  const handleRenameStage = async (id, newName) => {
    const oldStage = stages.find(s => s.id === id);
    setStages(stages.map(s => s.id === id ? { ...s, name: newName } : s));
    await supabase.from('stages').update({ name: newName }).eq('id', id);
    if (oldStage && oldStage.name !== newName) {
      appendProjectLog({
        projectId: oldStage.project_id,
        action: 'update_stage',
        entityType: 'stage',
        entityId: id,
        entityName: newName,
        details: { changes: [{ field: 'name', label: 'Название этапа', from: oldStage.name, to: newName }] }
      });
    }
  };

  const handleStageColorChange = async (id, newColor) => {
    const oldStage = stages.find(s => s.id === id);
    setStages(stages.map(s => s.id === id ? { ...s, color: newColor } : s));
    await supabase.from('stages').update({ color: newColor }).eq('id', id);
    if (oldStage && oldStage.color !== newColor) {
      appendProjectLog({
        projectId: oldStage.project_id,
        action: 'update_stage',
        entityType: 'stage',
        entityId: id,
        entityName: oldStage.name,
        details: { changes: [{ field: 'color', label: 'Цвет этапа', from: oldStage.color || 'Не задан', to: newColor }] }
      });
    }
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
                    <div
                      key={project.id}
                      className={`project-item ${activeProjectId === project.id ? 'active' : ''}`}
                      style={{ '--project-color': project.color || '#3b82f6' }}
                      onClick={() => { setActiveProjectId(project.id); setSelectedTaskId(null); }}
                    >
                      {(currentUser?.role === 'Администратор' || currentUser?.role === 'Менеджер проектов') && (
                        <label className="project-side-color-control" title="Изменить цвет проекта" onClick={(e) => e.stopPropagation()}>
                          <input type="color" value={project.color || '#3b82f6'} onChange={(e) => handleProjectColorChange(project, e.target.value)} />
                        </label>
                      )}
                      <div className="project-item-top">
                        <div className="project-title-group">
                          <div className="project-name">{project.name}</div>
                        </div>
                        <div className="project-actions" onClick={(e) => e.stopPropagation()}>
                          {currentUser?.role === 'Администратор' && (
                             <button className="btn btn-icon project-delete-btn" title="Удалить проект" onClick={() => handleDeleteProject(project.id)}>✕</button>
                          )}
                        </div>
                      </div>
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
              <div className="panel-header project-main-header" style={{ '--project-color': activeProject?.color || '#3b82f6' }}>
                <h2>
                  {activeProject?.name || 'Выберите проект'}
                </h2>
                <div className="view-tabs">
                  <button className={`view-tab ${activeProjectView === 'kanban' ? 'active' : ''}`} onClick={() => setActiveProjectView('kanban')}>Канбан (Карта)</button>
                  <button className={`view-tab ${activeProjectView === 'gantt' ? 'active' : ''}`} onClick={() => setActiveProjectView('gantt')}>Диаграмма Ганта</button>
                  <button className={`view-tab ${activeProjectView === 'files' ? 'active' : ''}`} onClick={() => setActiveProjectView('files')}>Файлы</button>
                  <button className={`view-tab ${activeProjectView === 'members' ? 'active' : ''}`} onClick={() => setActiveProjectView('members')}>Сотрудники</button>
                  <button className={`view-tab ${activeProjectView === 'logs' ? 'active' : ''}`} onClick={() => setActiveProjectView('logs')}>Logs</button>
                </div>
              </div>
              {activeProject && (
                <div className="project-overview">
                  <div className="project-progress-main">
                    <div className="project-progress-topline">
                      <div>
                        <div className="overview-label">Текущий этап</div>
                        <div className="overview-stage-name">
                          <span className="overview-stage-dot" style={{backgroundColor: projectMetrics.currentStage?.color || '#3b82f6'}}></span>
                          {projectMetrics.currentStage?.name || 'Нет этапов'}
                        </div>
                      </div>
                      <div className={`health-badge ${projectMetrics.health.key}`}>{projectMetrics.health.label}</div>
                    </div>
                    <div className="project-progress-bar">
                      <div className="project-progress-fill" style={{width: `${projectMetrics.actualProgress}%`}}></div>
                    </div>
                    <div className="project-progress-footer">
                      <span>{projectMetrics.actualProgress}% выполнено</span>
                      <span>План на сегодня: {projectMetrics.plannedProgress}%</span>
                    </div>
                  </div>
                  <div className="overview-metric">
                    <div className="overview-label">Задачи</div>
                    <div className="overview-value">{projectMetrics.done}/{projectMetrics.total}</div>
                  </div>
                  <div className="overview-metric">
                    <div className="overview-label">Отставание</div>
                    <div className="overview-value">{projectMetrics.lag}%</div>
                  </div>
                  <div className="overview-metric danger">
                    <div className="overview-label">Просрочено</div>
                    <div className="overview-value">{projectMetrics.overdue}</div>
                  </div>
                </div>
              )}
              <div className="panel-content" style={activeProjectView === 'gantt' ? { padding: 0, overflow: 'hidden' } : {}}>
                {activeProjectView === 'kanban' && (
                  <div className="map-container">
                    {projectStages.map(stage => {
                      const stageTasks = tasks.filter(t => t.stage_id === stage.id);
                      const stageProgress = getCompletionPercent(stageTasks);
                      return (
                        <div key={stage.id} className={`stage-column ${draggedStageId === stage.id ? 'dragging' : ''}`} onDragOver={handleDragOverStage} onDrop={(e) => handleDropStage(e, stage.id)}>
                          <div className="stage-header" draggable="true" onDragStart={(e) => handleDragStartStage(e, stage.id)} style={{ borderTop: `4px solid ${stage.color || '#3b82f6'}` }}>
                            <div className="stage-title" style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                              <input type="color" value={stage.color || '#3b82f6'} onChange={(e) => handleStageColorChange(stage.id, e.target.value)} style={{width: '20px', height: '20px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer'}} title="Выбрать цвет этапа" />
                              <input type="text" value={stage.name} onChange={(e) => handleRenameStage(stage.id, e.target.value)} style={{ background: 'transparent', border: 'none', color: 'inherit', fontWeight: 'inherit', fontSize: 'inherit', width: '100%', outline: 'none' }} />
                              {currentUser?.role === 'Администратор' && (
                                <button className="btn btn-icon danger" title="Удалить этап" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); handleDeleteStage(stage); }}>
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M3 6h18" />
                                    <path d="M8 6V4h8v2" />
                                    <path d="M19 6l-1 14H6L5 6" />
                                    <path d="M10 11v5" />
                                    <path d="M14 11v5" />
                                  </svg>
                                </button>
                              )}
                            </div>
                            <div className="stage-stats">
                              <span>{stageTasks.length} задач</span>
                              <span>{stageProgress}%</span>
                            </div>
                            <div className="stage-progress-track">
                              <div className="stage-progress-fill" style={{ width: `${stageProgress}%`, backgroundColor: stage.color || '#3b82f6' }}></div>
                            </div>
                          </div>
                          <div className="task-list">
                            {stageTasks.map(task => {
                              const assignee = getUser(task.assignee_id);
                              return (
                                <div key={task.id} className="task-card" data-status={task.status} onClick={(e) => { e.stopPropagation(); handleSelectTask(task); }}>
                                  {task.is_modified && <div className="modified-indicator" title="В задаче были изменения"></div>}
                                  {currentUser?.role === 'Администратор' && (
                                    <button className="task-delete-btn" title="Удалить задачу" onClick={(e) => { e.stopPropagation(); handleDeleteTask(task); }}>
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M3 6h18" />
                                        <path d="M8 6V4h8v2" />
                                        <path d="M19 6l-1 14H6L5 6" />
                                        <path d="M10 11v5" />
                                        <path d="M14 11v5" />
                                      </svg>
                                    </button>
                                  )}
                                  <div className="task-title">{task.name}</div>
                                  {(task.file_count > 0 || task.subtask_count > 0 || task.comment_count > 0 || task.is_modified) && (
                                    <div className="task-indicators">
                                      {task.file_count > 0 && (
                                        <span className="task-indicator" title={`Файлы: ${task.file_count}`}>
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M21.44 11.05 12 20.49a6 6 0 0 1-8.49-8.49l9.44-9.44a4 4 0 0 1 5.66 5.66l-9.44 9.44a2 2 0 0 1-2.83-2.83l8.49-8.49" />
                                          </svg>
                                          {task.file_count}
                                        </span>
                                      )}
                                      {task.subtask_count > 0 && (
                                        <span className="task-indicator" title={`Подзадачи: ${task.subtask_count}`}>
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M9 11 12 14 22 4" />
                                            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                                          </svg>
                                          {task.subtask_count}
                                        </span>
                                      )}
                                      {task.comment_count > 0 && (
                                        <span className="task-indicator" title={`Комментарии: ${task.comment_count}`}>
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                                          </svg>
                                          {task.comment_count}
                                        </span>
                                      )}
                                      {task.is_modified && (
                                        <span className="task-indicator modified" title="В задаче были изменения">
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M12 2v4" />
                                            <path d="M12 18v4" />
                                            <path d="m4.93 4.93 2.83 2.83" />
                                            <path d="m16.24 16.24 2.83 2.83" />
                                            <path d="M2 12h4" />
                                            <path d="M18 12h4" />
                                            <path d="m4.93 19.07 2.83-2.83" />
                                            <path d="m16.24 7.76 2.83-2.83" />
                                          </svg>
                                        </span>
                                      )}
                                    </div>
                                  )}
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
                    tasks={projectTasks} 
                    stages={projectStages} 
                    onSelectTask={(task) => handleSelectTask(task)} 
                  />
                )}
                {activeProjectView === 'files' && (
                  <div className="project-files-view">
                    {projectFiles.length > 0 ? projectFiles.map(file => {
                      const task = tasks.find(item => item.id === file.task_id);
                      const uploader = getUser(file.uploader_id);
                      return (
                        <div key={file.id} className="project-file-card">
                          {isImageFile(file) ? (
                            <a className="project-file-preview" href={file.file_url} target="_blank" rel="noreferrer">
                              <img src={file.file_url} alt={file.file_name} />
                            </a>
                          ) : (
                            <a className="project-file-preview file-icon" href={file.file_url} target="_blank" rel="noreferrer">
                              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <path d="M14 2v6h6" />
                              </svg>
                            </a>
                          )}
                          <div className="project-file-info">
                            <a href={file.file_url} target="_blank" rel="noreferrer" className="project-file-name">{file.file_name}</a>
                            <div className="project-file-meta">
                              <span>{formatFileSize(file.file_size)}</span>
                              <span>{task?.name || 'Задача не найдена'}</span>
                              <span>{uploader?.name || uploader?.email || 'Автор неизвестен'}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }) : (
                      <div className="empty-state">В проекте пока нет файлов</div>
                    )}
                  </div>
                )}
                {activeProjectView === 'members' && (
                  <div className="project-members-view">
                    {canManageProjectMembers && (
                      <form className="project-member-form" onSubmit={handleAddProjectMember}>
                        <select className="edit-select" value={memberUserId} onChange={(e) => setMemberUserId(e.target.value)} required>
                          <option value="">Выберите сотрудника</option>
                          {users.filter(user => !activeProjectMembers.some(member => member.user_id === user.id)).map(user => (
                            <option key={user.id} value={user.id}>{user.name || user.email}</option>
                          ))}
                        </select>
                        <select className="edit-select" value={memberRole} onChange={(e) => setMemberRole(e.target.value)}>
                          <option value="Участник">Участник</option>
                          <option value="Руководитель проекта">Руководитель проекта</option>
                        </select>
                        <button className="btn btn-primary" type="submit">Добавить</button>
                      </form>
                    )}
                    <div className="project-member-list">
                      {activeProjectMembers.length > 0 ? activeProjectMembers.map(member => {
                        const user = getUser(member.user_id);
                        const assignedTasks = projectTasks.filter(task => task.assignee_id === member.user_id);
                        const assignedCount = assignedTasks.length;
                        const completedCount = assignedTasks.filter(task => task.status === 'done').length;
                        const activeCount = assignedTasks.filter(task => task.status !== 'done').length;
                        const overdueCount = assignedTasks.filter(task => {
                          const dueDate = getDateOnly(task.date || task.due_date);
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          return dueDate && dueDate < today && task.status !== 'done';
                        }).length;
                        const donePercent = assignedCount > 0 ? Math.round((completedCount / assignedCount) * 100) : 0;
                        const activePercent = assignedCount > 0 ? Math.round((activeCount / assignedCount) * 100) : 0;
                        const overduePercent = assignedCount > 0 ? Math.round((overdueCount / assignedCount) * 100) : 0;
                        const workloadPercent = Math.min(100, Math.round((activeCount / 8) * 100));
                        const workloadLabel = activeCount >= 8 ? 'Перегруз' : activeCount >= 5 ? 'Высокая' : activeCount >= 2 ? 'Нормальная' : 'Свободен';
                        const nextTask = assignedTasks
                          .filter(task => task.status !== 'done' && getDateOnly(task.date || task.due_date))
                          .sort((a, b) => getDateOnly(a.date || a.due_date) - getDateOnly(b.date || b.due_date))[0];
                        return (
                          <div key={member.id} className="project-member-card">
                            <div className="project-member-photo">
                              {user?.avatar_url ? (
                                <img src={user.avatar_url} alt={user?.name || user?.email || 'Сотрудник'} />
                              ) : (
                                <div className="project-member-photo-fallback" style={{backgroundColor: user?.avatar_color || '#3b82f6'}}>{getUserInitials(user?.name || user?.email)}</div>
                              )}
                              {canManageProjectMembers && (
                                <button className="project-member-remove" title="Удалить из проекта" onClick={() => handleDeleteProjectMember(member)}>✕</button>
                              )}
                            </div>
                            <div className="project-member-card-body">
                              <div className="project-member-card-head">
                                <div>
                                  <div className="project-member-name">{user?.name || user?.email || 'Сотрудник'}</div>
                                  <div className="project-member-role">{member.role}</div>
                                </div>
                              </div>
                              <div className="project-member-contact-list">
                                <div className="project-member-contact accent-blue">
                                  <span className="project-member-contact-icon"><ProjectMemberIcon type="mail" /></span>
                                  <div>
                                    <span>Email</span>
                                    <strong>{user?.email || 'Не указан'}</strong>
                                  </div>
                                </div>
                                <div className="project-member-contact accent-pink">
                                  <span className="project-member-contact-icon"><ProjectMemberIcon type="phone" /></span>
                                  <div>
                                    <span>Телефон</span>
                                    <strong>{user?.phone || 'Не указан'}</strong>
                                  </div>
                                </div>
                                <div className="project-member-contact accent-cyan">
                                  <span className="project-member-contact-icon"><ProjectMemberIcon type="telegram" /></span>
                                  <div>
                                    <span>Telegram</span>
                                    <strong>{user?.telegram ? `@${String(user.telegram).replace(/^@/, '')}` : 'Не указан'}</strong>
                                  </div>
                                </div>
                                <div className="project-member-contact accent-orange">
                                  <span className="project-member-contact-icon"><ProjectMemberIcon type="role" /></span>
                                  <div>
                                    <span>Системная роль</span>
                                    <strong>{user?.role || 'Сотрудник'}</strong>
                                  </div>
                                  <em>В проекте</em>
                                </div>
                                <div className="project-member-contact accent-green">
                                  <span className="project-member-contact-icon"><ProjectMemberIcon type="date" /></span>
                                  <div>
                                    <span>Ближайший срок</span>
                                    <strong>{nextTask ? formatDate(nextTask.date || nextTask.due_date) : 'Нет активных сроков'}</strong>
                                  </div>
                                </div>
                              </div>
                              <div className="project-member-section-title">Статистика</div>
                              <div className="project-member-stats">
                                <div style={{ '--stat-progress': `${assignedCount > 0 ? 100 : 0}%` }}><strong>{assignedCount}</strong><span>всего</span><i>{assignedCount > 0 ? 100 : 0}%</i></div>
                                <div style={{ '--stat-progress': `${activePercent}%` }}><strong>{activeCount}</strong><span>активно</span><i>{activePercent}%</i></div>
                                <div style={{ '--stat-progress': `${donePercent}%` }}><strong>{completedCount}</strong><span>готово</span><i>{donePercent}%</i></div>
                                <div className={overdueCount > 0 ? 'danger' : ''} style={{ '--stat-progress': `${overduePercent}%` }}><strong>{overdueCount}</strong><span>просрочено</span><i>{overduePercent}%</i></div>
                              </div>
                              <div className="project-member-load">
                                <div className="project-member-load-row">
                                  <span>Выполнение</span>
                                  <strong>{donePercent}%</strong>
                                </div>
                                <div className="project-member-progress">
                                  <span style={{ width: `${donePercent}%` }} />
                                </div>
                                <div className="project-member-load-row">
                                  <span>Загрузка</span>
                                  <strong>{workloadLabel}</strong>
                                </div>
                                <div className={`project-member-progress workload ${activeCount >= 8 ? 'danger' : activeCount >= 5 ? 'warning' : ''}`}>
                                  <span style={{ width: `${workloadPercent}%` }} />
                                </div>
                              </div>
                              <div className="project-member-card-actions">
                                {canManageProjectMembers ? (
                                  <select className="edit-select compact" value={member.role} onChange={(e) => handleProjectMemberRoleChange(member, e.target.value)}>
                                    <option value="Участник">Участник</option>
                                    <option value="Руководитель проекта">Руководитель проекта</option>
                                  </select>
                                ) : (
                                  <div className="project-member-role-static">{member.role}</div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      }) : (
                        <div className="empty-state">В проект пока не добавлены сотрудники</div>
                      )}
                    </div>
                  </div>
                )}
                {activeProjectView === 'logs' && (
                  <div className="project-logs-view">
                    {activeProjectLogs.length > 0 ? activeProjectLogs.map(log => {
                      const actor = getUser(log.actor_id);
                      return (
                        <div key={log.id} className="project-log-row">
                          <div className="project-log-time">{new Date(log.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                          <div className="project-log-body">
                            <div>
                              <span className="project-log-actor">{actor?.name || actor?.email || 'Пользователь'}</span>{' '}
                              <span>{logActionLabels[log.action] || log.action}</span>{' '}
                              {log.entity_name && <span className="project-log-entity">{log.entity_name}</span>}
                            </div>
                            {log.details && Object.keys(log.details).length > 0 && (
                              <div className="project-log-details">
                                {Array.isArray(log.details.changes) && log.details.changes.length > 0 ? (
                                  <div className="project-log-change-list">
                                    {log.details.changes.map((change, index) => {
                                      const hasFrom = change.from !== undefined && change.from !== null && change.from !== '' && change.from !== 'Не было';
                                      const hasTo = change.to !== undefined && change.to !== null && change.to !== '';
                                      return (
                                        <div key={`${change.field || change.label}-${index}`} className={`project-log-change ${hasFrom && hasTo ? '' : 'compact'}`}>
                                          <span className="project-log-change-label">{change.label || change.field}</span>
                                          {hasFrom && hasTo ? (
                                            <>
                                              <span className="project-log-old">{String(change.from)}</span>
                                              <span className="project-log-arrow">→</span>
                                              <span className="project-log-new">{String(change.to)}</span>
                                            </>
                                          ) : (
                                            <span className="project-log-new">{String(change.to ?? change.from ?? '')}</span>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <>
                                    {log.details.field && <>Поле: {log.details.field}. </>}
                                    {log.details.from && <>Было: {String(log.details.from)}. </>}
                                    {log.details.to && <>Стало: {String(log.details.to)}.</>}
                                    {log.details.role && <>Роль: {log.details.role}</>}
                                    {log.details.fileName && <>Файл: {log.details.fileName}</>}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }) : (
                      <div className="empty-state">В проекте пока нет записей</div>
                    )}
                  </div>
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
                onTaskUpdated={(updatedTask, indicatorPatch = {}, logDetails = null) => {
                  setTasks(tasks.map(t => t.id === updatedTask.id ? { ...t, ...updatedTask, ...indicatorPatch } : t));
                  if (logDetails) {
                    const stage = stages.find(s => s.id === updatedTask.stage_id);
                    const { action, entityType, entityId, entityName, details, ...restDetails } = logDetails;
                    appendProjectLog({
                      projectId: stage?.project_id,
                      action: action || 'update_task',
                      entityType: entityType || 'task',
                      entityId: entityId || updatedTask.id,
                      entityName: entityName || updatedTask.name,
                      details: details || (Object.keys(restDetails).length > 0 ? restDetails : {})
                    });
                  }
                }} 
                onTaskFileAdded={(file) => {
                  setTaskFiles([file, ...taskFiles]);
                  appendProjectLog({
                    action: 'upload_file',
                    entityType: 'file',
                    entityId: file.id,
                    entityName: file.file_name
                  });
                }}
                onTaskFileDeleted={(fileId) => {
                  const file = taskFiles.find(item => item.id === fileId);
                  setTaskFiles(taskFiles.filter(item => item.id !== fileId));
                  appendProjectLog({
                    action: 'delete_file',
                    entityType: 'file',
                    entityId: fileId,
                    entityName: file?.file_name
                  });
                }}
                onTaskDeleted={(deletedTaskId) => {
                  setTasks(tasks.filter(t => t.id !== deletedTaskId));
                  setSelectedTaskId(null);
                }}
                onDragStart={handlePanelDragStart}
              />
           </div>
        )}
      </div>
    </div>
  );
}

export default App;
