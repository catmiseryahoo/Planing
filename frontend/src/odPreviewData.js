const previewUserId = 'od-preview-user';
const previewOrganizationId = 'od-preview-organization';
const previewProjectId = 'od-preview-project';

export const OD_PREVIEW_SESSION = {
  user: { id: previewUserId, email: 'design-preview@example.local', user_metadata: { name: 'Анна Морозова' } }
};

export const OD_PREVIEW_DATA = {
  currentUser: { id: previewUserId, email: 'design-preview@example.local', name: 'Анна Морозова', role: 'Администратор', avatar_color: '#f97316', notification_channels: { telegram: true, whatsapp: false, email: true }, is_super_admin: true },
  organizations: [{ id: previewOrganizationId, name: 'Orbite Studio', owner_id: previewUserId, created_at: '2026-07-01T09:00:00.000Z' }],
  organizationMembers: [{ id: 'od-preview-organization-member', organization_id: previewOrganizationId, user_id: previewUserId, role: 'owner' }],
  projects: [{ id: previewProjectId, organization_id: previewOrganizationId, name: 'Planing', status: 'В работе', color: '#f97316', created_at: '2026-07-01T09:00:00.000Z' }],
  stages: [
    { id: 'od-preview-stage-brief', project_id: previewProjectId, name: 'Бриф', order: 1, color: '#64748b' },
    { id: 'od-preview-stage-design', project_id: previewProjectId, name: 'Дизайн', order: 2, color: '#f97316' },
    { id: 'od-preview-stage-build', project_id: previewProjectId, name: 'Разработка', order: 3, color: '#3b82f6' },
    { id: 'od-preview-stage-done', project_id: previewProjectId, name: 'Готово', order: 4, color: '#22c55e' }
  ],
  tasks: [
    { id: 'od-preview-task-brief', project_id: previewProjectId, stage_id: 'od-preview-stage-brief', name: 'Уточнить сценарий входа', description: 'Проверить первый экран и путь пользователя до рабочего пространства.', status: 'done', priority: 'high', assignee_id: previewUserId, date: '2026-07-21', subtask_count: 3, comment_count: 4, file_count: 1 },
    { id: 'od-preview-task-design', project_id: previewProjectId, stage_id: 'od-preview-stage-design', name: 'Обновить визуальный язык Planing', description: 'Собрать спокойную рабочую поверхность с заметными акцентами для статусов и действий.', status: 'in-progress', priority: 'high', assignee_id: previewUserId, date: '2026-07-29', subtask_count: 5, comment_count: 7, file_count: 2 },
    { id: 'od-preview-task-board', project_id: previewProjectId, stage_id: 'od-preview-stage-design', name: 'Пересобрать карточку задачи', description: 'Показать прогресс, исполнителя, сроки и активность без перегруза.', status: 'review', priority: 'medium', assignee_id: previewUserId, date: '2026-07-31', subtask_count: 2, comment_count: 3, file_count: 0 },
    { id: 'od-preview-task-gantt', project_id: previewProjectId, stage_id: 'od-preview-stage-build', name: 'Проверить представление карты', description: 'Сверить канбан, график и представление прогресса.', status: 'planned', priority: 'low', assignee_id: previewUserId, date: '2026-08-04', subtask_count: 1, comment_count: 0, file_count: 0 },
    { id: 'od-preview-task-release', project_id: previewProjectId, stage_id: 'od-preview-stage-done', name: 'Подготовить релизный чеклист', description: 'Финальная проверка интерфейса на desktop и mobile.', status: 'done', priority: 'medium', assignee_id: previewUserId, date: '2026-07-18', subtask_count: 4, comment_count: 2, file_count: 1 }
  ],
  users: [{ id: previewUserId, email: 'design-preview@example.local', name: 'Анна Морозова', role: 'Администратор', avatar_color: '#f97316', is_super_admin: true, phone: '+7 900 000-00-00', telegram: 'orbite_design' }],
  projectMembers: [{ id: 'od-preview-project-member', project_id: previewProjectId, user_id: previewUserId, role: 'Руководитель проекта' }],
  projectLogs: [
    { id: 'od-preview-log-1', project_id: previewProjectId, action: 'update_project', entity_type: 'project', entity_name: 'Planing', created_at: '2026-07-26T08:40:00.000Z', details: {} },
    { id: 'od-preview-log-2', project_id: previewProjectId, action: 'update_task', entity_type: 'task', entity_name: 'Обновить визуальный язык Planing', created_at: '2026-07-25T15:20:00.000Z', details: {} }
  ],
  taskFiles: [
    { id: 'od-preview-file-1', task_id: 'od-preview-task-design', file_name: 'design-brief.pdf', file_url: '#', file_size: 245760, created_at: '2026-07-25T12:00:00.000Z' },
    { id: 'od-preview-file-2', task_id: 'od-preview-task-design', file_name: 'moodboard.png', file_url: '#', file_size: 1048576, created_at: '2026-07-25T12:05:00.000Z' }
  ],
  siteMessages: [{ id: 'od-preview-message-1', organization_id: previewOrganizationId, author_id: previewUserId, body: 'Preview-режим: данные локальные, Supabase не вызывается.', recipient_ids: [], project_id: previewProjectId, created_at: '2026-07-26T08:30:00.000Z' }],
  visualizations: [],
  rolePermissions: []
};
