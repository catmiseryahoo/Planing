import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, LazyMotion, domAnimation, m, useReducedMotion } from 'motion/react';
import { supabase } from './supabaseClient';
import AuthScreen from './components/Auth/AuthScreen';
import ProfilePanel from './components/Profile/ProfilePanel';
import TaskSidebar from './components/Task/TaskSidebar';
import GanttChart from './components/Map/GanttChart';
import MessengerPanel from './components/Messenger/MessengerPanel';
import ErrorBoundary from './components/Messenger/ErrorBoundary';
import { formatPhone, isCompletePhone } from './utils/phone';
import './index.css';

const statusLabels = {
  'planned': 'План',
  'in-progress': 'В работе',
  'review': 'Проверка',
  'done': 'Готово',
  'overdue': 'Просрочено'
};

const AVAILABLE_PERMISSIONS = [
  { key: 'create_projects', label: 'Создание проектов' },
  { key: 'manage_projects', label: 'Управление проектами (удаление/переименование)' },
  { key: 'manage_staff', label: 'Управление сотрудниками' },
  { key: 'manage_stages', label: 'Управление этапами (колонками)' },
  { key: 'manage_tasks', label: 'Управление задачами' },
  { key: 'manage_visualizations', label: 'Управление визуализациями' }
];

const CUSTOMIZABLE_ROLES = [
  'Администратор',
  'Менеджер проектов',
  'Дизайнер',
  'Разработчик',
  'Сотрудник'
];

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

const buildAuthProfileFallback = (authUser) => {
  const email = authUser?.email?.trim().toLowerCase() || '';
  return {
    id: authUser?.id,
    email,
    name: authUser?.user_metadata?.name || authUser?.user_metadata?.full_name || email || 'Пользователь',
    role: 'Сотрудник',
    avatar_color: '#3b82f6',
    notification_channels: { telegram: false, whatsapp: false, email: true },
    is_super_admin: false
  };
};

const withTimeout = (promise, timeoutMs, message) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    window.clearTimeout(timeoutId);
  });
};

const runSupabaseRequest = async (request, message, timeoutMs = 12000, retries = 1) => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await withTimeout(Promise.resolve(request), timeoutMs, message);
      if (response && response.error) {
        const status = response.error.status;
        const isRetryable = !status || status >= 500 || status === 429 || status === 408;
        if (isRetryable && attempt < retries) {
          console.warn(`Request failed with status ${status || 'network'}. Retrying attempt ${attempt + 1}...`);
          await new Promise(resolve => window.setTimeout(resolve, 500 * (attempt + 1)));
          continue;
        }
      }
      return response;
    } catch (error) {
      if (attempt < retries) {
        console.warn(`Request timed out or failed: ${error.message || error}. Retrying attempt ${attempt + 1}...`);
        await new Promise(resolve => window.setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
};

const loadWorkspaceData = async (requests) => {
  const entries = [];
  const batchSize = 3;
  for (let i = 0; i < requests.length; i += batchSize) {
    const batch = requests.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async ({ key, label, request, fallback = [], timeoutMs = 12000 }) => {
        try {
          const response = await runSupabaseRequest(request, `${label}: таймаут`, timeoutMs);
          if (response.error) {
            console.warn(`${label} load failed.`, response.error);
            return [key, { data: fallback, error: response.error, label }];
          }
          return [key, { data: response.data || fallback, error: null, label }];
        } catch (error) {
          console.warn(`${label} load timed out.`, error);
          return [key, { data: fallback, error, label }];
        }
      })
    );
    entries.push(...results);
  }

  return Object.fromEntries(entries);
};

const getLoadErrorMessage = (error) => {
  if (!error) return '';
  if (error.message) return error.message;
  if (error.details) return error.details;
  if (error.hint) return error.hint;
  if (error.code) return error.code;
  return String(error);
};

const clearStoredAuthSession = () => {
  try {
    window.localStorage.removeItem('sb-wqfpksyemvaxncsqwuzm-auth-token');
  } catch {
    // Local session reset should keep working even when storage is unavailable.
  }
};

const syncSessionProfile = async (authUser) => {
  const fallbackProfile = buildAuthProfileFallback(authUser);
  let ownProfile;
  let ownProfileError;

  try {
    const profileResponse = await runSupabaseRequest(
      supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle(),
      'Supabase не ответил на запрос профиля.',
      6000
    );
    ownProfile = profileResponse.data;
    ownProfileError = profileResponse.error;
  } catch (error) {
    ownProfileError = error;
    console.warn('Direct profile lookup timed out, trying Edge Function.', error);
  }

  if (ownProfile) {
    return { profile: ownProfile, isFallback: false };
  }

  if (!ownProfileError) {
    let createdProfile;
    let createProfileError;

    try {
      const createProfileResponse = await runSupabaseRequest(
        supabase
          .from('profiles')
          .insert({
            id: fallbackProfile.id,
            email: fallbackProfile.email,
            name: fallbackProfile.name,
            role: fallbackProfile.role,
            avatar_color: fallbackProfile.avatar_color,
            notification_channels: fallbackProfile.notification_channels
          })
          .select()
          .single(),
        'Supabase не ответил на создание профиля.',
        6000
      );
      createdProfile = createProfileResponse.data;
      createProfileError = createProfileResponse.error;
    } catch (error) {
      createProfileError = error;
    }

    if (createdProfile) {
      return { profile: createdProfile, isFallback: false };
    }

    console.warn('Direct profile creation failed, trying Edge Function.', createProfileError);
  } else {
    console.warn('Direct profile lookup failed, trying Edge Function.', ownProfileError);
  }

  try {
    const { data, error } = await runSupabaseRequest(
      supabase.functions.invoke('sync-own-profile', {
        body: {}
      }),
      'Supabase Edge Function sync-own-profile не ответила.',
      6000
    );

    if (error) {
      throw error;
    }

    if (data?.profile) {
      return { profile: data.profile, isFallback: false };
    }
  } catch (error) {
    console.warn('Edge profile sync failed, using auth session fallback.', error);
  }

  return { profile: fallbackProfile, isFallback: true };
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

const MESSENGER_SIDEBAR_WIDTH = 260;
const MESSENGER_HEADER_HEIGHT = 76;
const MESSENGER_MIN_CHAT_WIDTH = 320;
const MESSENGER_MIN_CHAT_HEIGHT = 340;
const TASK_PANEL_WIDTH = 380;
const FLOATING_WINDOW_MARGIN = 8;
const CLOCK_TIME_ZONE_STORAGE_KEY = 'orbite-clock-time-zone';
const CLOCK_TIME_ZONES = [
  'Asia/Yekaterinburg',
  'Europe/Moscow',
  'UTC',
  'Europe/Kaliningrad',
  'Asia/Almaty',
  'Asia/Dubai',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'Asia/Tokyo'
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const getBrowserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const isValidTimeZone = (timeZone) => {
  try {
    Intl.DateTimeFormat('ru-RU', { timeZone }).format(Date.now());
    return true;
  } catch {
    return false;
  }
};

const getInitialClockTimeZone = () => {
  const browserTimeZone = getBrowserTimeZone();
  try {
    const savedTimeZone = localStorage.getItem(CLOCK_TIME_ZONE_STORAGE_KEY);
    return savedTimeZone && isValidTimeZone(savedTimeZone) ? savedTimeZone : browserTimeZone;
  } catch {
    return browserTimeZone;
  }
};

const formatTimeZoneLabel = (timeZone) => timeZone.replace(/_/g, ' ');

const organizationRoleLabels = {
  owner: 'Владелец',
  admin: 'Администратор',
  project_manager: 'Проектный менеджер',
  member: 'Участник'
};

const defaultNotificationChannels = {
  telegram: false,
  whatsapp: false,
  email: false
};

const notificationChannelLabels = {
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  email: 'Email'
};

const getNotificationChannels = (user) => ({
  ...defaultNotificationChannels,
  ...(user?.notification_channels || {})
});

const defaultOrganizationNotificationChannels = {
  telegram: {
    enabled: false,
    sender: '',
    destination: ''
  },
  whatsapp: {
    enabled: false,
    sender: '',
    phone: ''
  },
  email: {
    enabled: false,
    fromName: '',
    fromEmail: '',
    replyTo: ''
  }
};

const getOrganizationNotificationChannels = (organization) => {
  const channels = organization?.notification_channels || {};
  return Object.fromEntries(
    Object.entries(defaultOrganizationNotificationChannels).map(([channel, defaults]) => [
      channel,
      { ...defaults, ...(channels[channel] || {}) }
    ])
  );
};

const getClockTimeZones = () => {
  const browserTimeZone = getBrowserTimeZone();
  return Array.from(new Set([browserTimeZone, ...CLOCK_TIME_ZONES]));
};

const fetchServerUtcMs = async (signal) => {
  const syncRequests = [
    async () => {
      const response = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC', { cache: 'no-store', signal });
      if (!response.ok) throw new Error('WorldTimeAPI is unavailable');
      const data = await response.json();
      const timestamp = Date.parse(data.utc_datetime || data.datetime);
      if (Number.isNaN(timestamp)) throw new Error('WorldTimeAPI returned invalid time');
      return { timestamp, source: 'WorldTimeAPI' };
    },
    async () => {
      const response = await fetch('https://timeapi.io/api/TimeZone/zone?timeZone=UTC', { cache: 'no-store', signal });
      if (!response.ok) throw new Error('TimeAPI is unavailable');
      const data = await response.json();
      const timestamp = Date.parse(data.currentUtcDateTime);
      if (Number.isNaN(timestamp)) throw new Error('TimeAPI returned invalid time');
      return { timestamp, source: 'TimeAPI' };
    },
    async () => {
      const response = await fetch('/', { method: 'HEAD', cache: 'no-store', signal });
      const serverDate = response.headers.get('date');
      const timestamp = Date.parse(serverDate);
      if (Number.isNaN(timestamp)) throw new Error('Server Date header is unavailable');
      return { timestamp, source: 'сервер приложения' };
    }
  ];

  for (const request of syncRequests) {
    try {
      return await request();
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }

  return { timestamp: Date.now(), source: 'локальное время' };
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
  const shouldReduceMotion = useReducedMotion();
  const [session, setSession] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  const [projects, setProjects] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [organizationMembers, setOrganizationMembers] = useState([]);
  const [stages, setStages] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [taskFiles, setTaskFiles] = useState([]);
  const [projectMembers, setProjectMembers] = useState([]);
  const [projectLogs, setProjectLogs] = useState([]);
  const [siteMessages, setSiteMessages] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [rolePermissions, setRolePermissions] = useState([]);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);
  const [profileSyncError, setProfileSyncError] = useState('');
  const [dataLoadError, setDataLoadError] = useState('');
  const [isMessengerOpen, setIsMessengerOpen] = useState(false);
  const [hoveredTooltip, setHoveredTooltip] = useState(null);
  const [messengerText, setMessengerText] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [selectedMessengerUserIds, setSelectedMessengerUserIds] = useState([]);
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const [messengerWindow, setMessengerWindow] = useState({
    x: Math.max(16, window.innerWidth - 760),
    y: 84
  });
  const [messengerChatSize, setMessengerChatSize] = useState({
    width: 470,
    height: 520
  });
  const [isDraggingMessenger, setIsDraggingMessenger] = useState(false);
  const [isResizingMessenger, setIsResizingMessenger] = useState(false);
  const [messengerDragOffset, setMessengerDragOffset] = useState({ x: 0, y: 0 });
  const [messengerResizeStart, setMessengerResizeStart] = useState(null);

  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activeOrganizationId, setActiveOrganizationId] = useState(null);
  const [activeView, setActiveView] = useState('map'); // map, admin
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [activeProjectView, setActiveProjectView] = useState('kanban'); // kanban, gantt, visualizations
  const [visualizations, setVisualizations] = useState([]);
  const [selectedVisualization, setSelectedVisualization] = useState(null);
  const [isCodeCollapsed, setIsCodeCollapsed] = useState(false);
  const [isDesktopView, setIsDesktopView] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [editingProjectName, setEditingProjectName] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [draggedStageId, setDraggedStageId] = useState(null);

  const [panelPos, setPanelPos] = useState({ x: window.innerWidth - 420, y: 80 });
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const [panelDragOffset, setPanelDragOffset] = useState({ x: 0, y: 0 });

  // Admin Create User states
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState('Сотрудник');
  const [newOrganizationName, setNewOrganizationName] = useState('');
  const [organizationManagerId, setOrganizationManagerId] = useState('');
  const [memberUserId, setMemberUserId] = useState('');
  const [memberRole, setMemberRole] = useState('Участник');
  const [clockTimeZone, setClockTimeZone] = useState(getInitialClockTimeZone);
  const [clockNowMs, setClockNowMs] = useState(Date.now());
  const [clockSyncState, setClockSyncState] = useState({
    source: 'локальное время',
    syncedAt: null,
    isSyncing: true
  });
  const [isClockZoneMenuOpen, setIsClockZoneMenuOpen] = useState(false);

  const [adminEditingUser, setAdminEditingUser] = useState(null);
  const [adminActiveTab, setAdminActiveTab] = useState('users');
  const [adminEditPassword, setAdminEditPassword] = useState('');
  const [adminEditPasswordConfirm, setAdminEditPasswordConfirm] = useState('');

  const messengerEndRef = useRef(null);
  const messengerTextareaRef = useRef(null);
  const clockMenuRef = useRef(null);
  const latestMessageAtRef = useRef('');
  const skipProjectNameSaveRef = useRef(false);
  const profileModalRef = useRef(null);

  const getConstrainedMessengerLayout = useCallback((position, size) => {
    if (window.innerWidth <= 900) {
      return { position, size };
    }

    const maxChatWidth = Math.max(
      MESSENGER_MIN_CHAT_WIDTH,
      window.innerWidth - MESSENGER_SIDEBAR_WIDTH - FLOATING_WINDOW_MARGIN * 3
    );
    const nextWidth = Math.min(size.width, maxChatWidth);
    const totalWidth = MESSENGER_SIDEBAR_WIDTH + nextWidth;
    const maxX = Math.max(FLOATING_WINDOW_MARGIN, window.innerWidth - totalWidth - FLOATING_WINDOW_MARGIN);
    const nextX = clamp(position.x, FLOATING_WINDOW_MARGIN, maxX);

    const maxChatHeight = Math.max(
      MESSENGER_MIN_CHAT_HEIGHT,
      window.innerHeight - MESSENGER_HEADER_HEIGHT - FLOATING_WINDOW_MARGIN * 2
    );
    const nextHeight = Math.min(size.height, maxChatHeight);
    const maxY = Math.max(FLOATING_WINDOW_MARGIN, window.innerHeight - MESSENGER_HEADER_HEIGHT - nextHeight - FLOATING_WINDOW_MARGIN);
    const nextY = clamp(position.y, FLOATING_WINDOW_MARGIN, maxY);

    return {
      position: { x: nextX, y: nextY },
      size: { width: nextWidth, height: nextHeight }
    };
  }, []);

  const getConstrainedPanelPosition = useCallback((position) => {
    if (window.innerWidth <= 900) {
      return position;
    }

    return {
      x: clamp(position.x, FLOATING_WINDOW_MARGIN, Math.max(FLOATING_WINDOW_MARGIN, window.innerWidth - TASK_PANEL_WIDTH - FLOATING_WINDOW_MARGIN)),
      y: clamp(position.y, FLOATING_WINDOW_MARGIN, Math.max(FLOATING_WINDOW_MARGIN, window.innerHeight - 120))
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadSession = async () => {
      try {
        const {
          data: { session },
        } = await runSupabaseRequest(
          supabase.auth.getSession(),
          'Supabase не ответил на проверку сессии.',
          5000
        );

        if (!session) {
          if (!isMounted) return;
          setSession(null);
          setIsLoadingAuth(false);
          return;
        }

        const {
          data: { user },
          error,
        } = await runSupabaseRequest(
          supabase.auth.getUser(),
          'Supabase не подтвердил сессию.',
          5000
        );

        if (!isMounted) return;

        if (error || !user) {
          clearStoredAuthSession();
          setSession(null);
        } else {
          setSession(session);
        }
      } catch (error) {
        console.warn('Auth session validation failed, clearing local session.', error);
        clearStoredAuthSession();
        if (isMounted) {
          setSession(null);
        }
      } finally {
        if (isMounted) {
          setIsLoadingAuth(false);
        }
      }
    };

    loadSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      setSession(session);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CLOCK_TIME_ZONE_STORAGE_KEY, clockTimeZone);
    } catch {
      // Ignore storage failures; the clock still works for the current session.
    }
  }, [clockTimeZone]);

  useEffect(() => {
    if (!isClockZoneMenuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (clockMenuRef.current?.contains(event.target)) return;
      setIsClockZoneMenuOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isClockZoneMenuOpen]);

  useEffect(() => {
    let isMounted = true;
    let serverUtcMs = Date.now();
    let localSyncedAtMs = Date.now();
    const abortController = new AbortController();

    const updateDisplayedTime = () => {
      const elapsedMs = Date.now() - localSyncedAtMs;
      setClockNowMs(serverUtcMs + elapsedMs);
    };

    const syncClock = async () => {
      setClockSyncState(current => ({ ...current, isSyncing: true }));
      const { timestamp, source } = await fetchServerUtcMs(abortController.signal);
      if (!isMounted) return;
      serverUtcMs = timestamp;
      localSyncedAtMs = Date.now();
      setClockNowMs(timestamp);
      setClockSyncState({ source, syncedAt: localSyncedAtMs, isSyncing: false });
    };

    syncClock().catch(() => {
      if (!isMounted) return;
      serverUtcMs = Date.now();
      localSyncedAtMs = Date.now();
      setClockNowMs(serverUtcMs);
      setClockSyncState({ source: 'локальное время', syncedAt: localSyncedAtMs, isSyncing: false });
    });

    const tickIntervalId = window.setInterval(updateDisplayedTime, 1000);
    const syncIntervalId = window.setInterval(() => {
      syncClock().catch(() => {});
    }, 5 * 60 * 1000);

    return () => {
      isMounted = false;
      abortController.abort();
      window.clearInterval(tickIntervalId);
      window.clearInterval(syncIntervalId);
    };
  }, []);

  const fetchData = useCallback(async (preferredOrganizationId = activeOrganizationId) => {
    if (!session) return;
    setIsDataLoading(true);
    setProfileSyncError('');
    setDataLoadError('');
    let hasSyncedProfile = false;
    try {
      const { profile: syncedProfile, isFallback: isProfileFallback } = await syncSessionProfile(session.user);
      if (syncedProfile) {
        hasSyncedProfile = true;
        setCurrentUser(syncedProfile);
      }

      let siteMessagesQuery = supabase
        .from('site_messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(200);

      if (preferredOrganizationId) {
        siteMessagesQuery = siteMessagesQuery.eq('organization_id', preferredOrganizationId);
      }

      const workspaceData = await loadWorkspaceData([
        {
          key: 'projects',
          label: 'Проекты',
          request: supabase.from('projects').select('*').order('created_at', { ascending: true })
        },
        {
          key: 'organizations',
          label: 'Организации',
          request: supabase.from('organizations').select('*').order('created_at', { ascending: true })
        },
        {
          key: 'organizationMembers',
          label: 'Участники организаций',
          request: supabase.from('organization_members').select('*')
        },
        {
          key: 'stages',
          label: 'Этапы',
          request: supabase.from('stages').select('*').order('order', { ascending: true })
        },
        {
          key: 'tasks',
          label: 'Задачи',
          request: supabase.from('tasks').select('*')
        },
        {
          key: 'profiles',
          label: 'Профили сотрудников',
          request: supabase.from('profiles').select('*')
        },
        {
          key: 'subtasks',
          label: 'Подзадачи',
          request: supabase.from('subtasks').select('task_id')
        },
        {
          key: 'comments',
          label: 'Комментарии',
          request: supabase.from('comments').select('task_id')
        },
        {
          key: 'files',
          label: 'Файлы задач',
          request: supabase.from('task_files').select('*').order('created_at', { ascending: false })
        },
        {
          key: 'members',
          label: 'Участники проектов',
          request: supabase.from('project_members').select('*')
        },
        {
          key: 'logs',
          label: 'Журнал проекта',
          request: supabase.from('project_logs').select('*').order('created_at', { ascending: false }).limit(300)
        },
        {
          key: 'visualizations',
          label: 'Визуализации',
          request: supabase.from('project_visualizations').select('*').order('created_at', { ascending: false })
        },
        {
          key: 'rolePermissions',
          label: 'Настройки прав ролей',
          request: supabase.from('role_permissions').select('*')
        },
        {
          key: 'messages',
          label: 'Сообщения',
          request: siteMessagesQuery
        }
      ]);

      const {
        projects: projectsRes,
        organizations: organizationsRes,
        organizationMembers: organizationMembersRes,
        stages: stagesRes,
        tasks: tasksRes,
        profiles: profilesRes,
        subtasks: subtasksRes,
        comments: commentsRes,
        files: filesRes,
        members: membersRes,
        logs: logsRes,
        messages: messagesRes,
        visualizations: visualizationsRes,
        rolePermissions: rolePermissionsRes
      } = workspaceData;
      const failedSections = Object.values(workspaceData)
        .filter(result => result.error)
        .map(result => {
          const message = getLoadErrorMessage(result.error);
          return message ? `${result.label} (${message})` : result.label;
        });

      const subtaskCounts = countByTaskId(subtasksRes.data);
      const commentCounts = countByTaskId(commentsRes.data);
      const fileCounts = countByTaskId(filesRes.data);
      const tasksWithIndicators = (tasksRes.data || []).map(task => ({
        ...task,
        subtask_count: subtaskCounts[task.id] || 0,
        comment_count: commentCounts[task.id] || 0,
        file_count: fileCounts[task.id] || 0
      }));

      const fetchedProjects = projectsRes.data || [];
      const fetchedOrganizations = organizationsRes.data || [];
      const nextOrganizationId = preferredOrganizationId || fetchedOrganizations[0]?.id || null;
      const nextOrganizationProjects = fetchedProjects.filter(project => project.organization_id === nextOrganizationId);

      setProjects(fetchedProjects);
      setOrganizations(fetchedOrganizations);
      setOrganizationMembers(organizationMembersRes.data || []);
      setStages(stagesRes.data || []);
      setTasks(tasksWithIndicators);
      const fetchedProfiles = profilesRes.data || [];
      const nextUsers = syncedProfile
        ? (
          fetchedProfiles.some(user => user.id === syncedProfile.id)
            ? fetchedProfiles.map(user => user.id === syncedProfile.id ? { ...user, ...syncedProfile } : user)
            : [syncedProfile, ...fetchedProfiles]
        )
        : fetchedProfiles;

      setUsers(nextUsers);
      setTaskFiles(filesRes.data || []);
      setProjectMembers(membersRes.data || []);
      setProjectLogs(logsRes.data || []);
      setVisualizations(visualizationsRes.data || []);
      setSiteMessages(messagesRes.data || []);
      setRolePermissions(rolePermissionsRes.data || []);
      latestMessageAtRef.current = messagesRes.data?.at(-1)?.created_at || '';

      setActiveOrganizationId(nextOrganizationId);
      setActiveProjectId(currentId => (
        nextOrganizationProjects.some(project => project.id === currentId)
          ? currentId
          : nextOrganizationProjects[0]?.id || null
      ));

      const me = nextUsers.find(u => u.id === session.user.id) || syncedProfile;
      if (me) {
        setCurrentUser(me);
        if (failedSections.length) {
          setDataLoadError(`Часть данных не загрузилась: ${failedSections.join(', ')}. Можно продолжать работу и повторить загрузку.`);
        }
        if (isProfileFallback) {
          setProfileSyncError('Профиль временно взят из авторизации. Проверьте подключение к Supabase, если данные сотрудника неполные.');
        }
      } else {
        setProfileSyncError('Профиль пользователя не найден после синхронизации.');
      }
    } catch (error) {
      console.error(error);
      if (hasSyncedProfile) {
        setDataLoadError(error instanceof Error ? error.message : 'Не удалось загрузить данные рабочего пространства.');
      } else {
        setProfileSyncError(error instanceof Error ? error.message : 'Не удалось синхронизировать профиль.');
      }
    } finally {
      setIsDataLoading(false);
    }
  }, [activeOrganizationId, session]);

  useEffect(() => {
    if (!session) return undefined;
    const timeoutId = window.setTimeout(fetchData, 0);
    return () => window.clearTimeout(timeoutId);
  }, [fetchData, session]);

  const fetchSiteMessages = useCallback(async () => {
    if (!currentUser?.id || !activeOrganizationId) return;
    const { data, error } = await supabase
      .from('site_messages')
      .select('*')
      .eq('organization_id', activeOrganizationId)
      .order('created_at', { ascending: true })
      .limit(200);

    if (!error) {
      const latestSeenAt = latestMessageAtRef.current;
      const incomingNewMessage = (data || []).some(message =>
        message.created_at > latestSeenAt && message.author_id !== currentUser?.id
      );
      if (incomingNewMessage && !isMessengerOpen) {
        setHasUnreadMessages(true);
      }
      latestMessageAtRef.current = data?.at(-1)?.created_at || latestSeenAt;
      setSiteMessages(data || []);
    }
  }, [activeOrganizationId, currentUser?.id, isMessengerOpen]);

  useEffect(() => {
    if (!session || !currentUser) return undefined;
    const timeoutId = window.setTimeout(fetchSiteMessages, 0);
    const intervalId = window.setInterval(fetchSiteMessages, 5000);
    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [session, currentUser, fetchSiteMessages]);

  useEffect(() => {
    if (isMessengerOpen) {
      messengerEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [siteMessages, isMessengerOpen]);

  useEffect(() => {
    const handleResize = () => {
      setMessengerWindow(currentPosition => {
        const nextLayout = getConstrainedMessengerLayout(currentPosition, messengerChatSize);
        setMessengerChatSize(currentSize => (
          currentSize.width === nextLayout.size.width && currentSize.height === nextLayout.size.height
            ? currentSize
            : nextLayout.size
        ));
        return currentPosition.x === nextLayout.position.x && currentPosition.y === nextLayout.position.y
          ? currentPosition
          : nextLayout.position;
      });
      setPanelPos(currentPosition => {
        const nextPosition = getConstrainedPanelPosition(currentPosition);
        return currentPosition.x === nextPosition.x && currentPosition.y === nextPosition.y
          ? currentPosition
          : nextPosition;
      });
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, [getConstrainedMessengerLayout, getConstrainedPanelPosition, messengerChatSize]);

  useEffect(() => {
    if (!isProfileOpen) return;

    const savedWidth = localStorage.getItem('profile-modal-width');
    const savedHeight = localStorage.getItem('profile-modal-height');
    if (savedWidth && savedHeight && profileModalRef.current) {
      profileModalRef.current.style.width = savedWidth;
      profileModalRef.current.style.height = savedHeight;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          localStorage.setItem('profile-modal-width', entry.target.style.width || `${width}px`);
          localStorage.setItem('profile-modal-height', entry.target.style.height || `${height}px`);
        }
      }
    });

    if (profileModalRef.current) {
      observer.observe(profileModalRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [isProfileOpen]);

  useEffect(() => {
    if (!isDraggingMessenger && !isResizingMessenger) return undefined;

    const handleMouseMove = (e) => {
      if (isDraggingMessenger) {
        const nextPosition = {
          x: e.clientX - messengerDragOffset.x,
          y: e.clientY - messengerDragOffset.y
        };
        setMessengerWindow(getConstrainedMessengerLayout(nextPosition, messengerChatSize).position);
      }

      if (isResizingMessenger && messengerResizeStart) {
        const requestedSize = {
          width: Math.max(MESSENGER_MIN_CHAT_WIDTH, messengerResizeStart.width + e.clientX - messengerResizeStart.mouseX),
          height: Math.max(MESSENGER_MIN_CHAT_HEIGHT, messengerResizeStart.height + e.clientY - messengerResizeStart.mouseY)
        };
        const nextLayout = getConstrainedMessengerLayout(
          { x: messengerResizeStart.x, y: messengerResizeStart.y },
          requestedSize
        );
        setMessengerWindow(nextLayout.position);
        setMessengerChatSize(nextLayout.size);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingMessenger(false);
      setIsResizingMessenger(false);
      setMessengerResizeStart(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [getConstrainedMessengerLayout, isDraggingMessenger, isResizingMessenger, messengerChatSize, messengerDragOffset, messengerResizeStart]);

  useEffect(() => {
    const textarea = messengerTextareaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [messengerText]);


  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingPanel) return;
      setPanelPos(getConstrainedPanelPosition({ x: e.clientX - panelDragOffset.x, y: e.clientY - panelDragOffset.y }));
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
  }, [getConstrainedPanelPosition, isDraggingPanel, panelDragOffset]);

  const handleLogout = async () => {
    setSession(null);
    setCurrentUser(null);
    setProfileSyncError('');
    setDataLoadError('');

    clearStoredAuthSession();

    try {
      await runSupabaseRequest(
        supabase.auth.signOut(),
        'Supabase не ответил на выход из аккаунта.',
        3000
      );
    } catch (error) {
      console.warn('Remote sign-out failed after local session reset.', error);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!canManageOrganizationStaff) return;

    const { data, error } = await supabase.functions.invoke('create-user', {
      body: {
        email: newUserEmail,
        password: newUserPassword,
        name: newUserName,
        role: newUserRole,
        organizationId: activeOrganizationId
      }
    });

    if (error) {
      alert("Ошибка при создании сотрудника: " + error.message);
      return;
    }

    const createdUserId = data?.user?.id;
    if (activeOrganizationId && createdUserId) {
      const organizationRole = newUserRole === 'Администратор' ? 'admin' : (newUserRole === 'Менеджер проектов' ? 'project_manager' : 'member');
      await supabase
        .from('organization_members')
        .upsert([{ organization_id: activeOrganizationId, user_id: createdUserId, role: organizationRole }], { onConflict: 'organization_id,user_id' });
    }

    alert("Сотрудник успешно создан и добавлен в базу!");
    setNewUserEmail('');
    setNewUserPassword('');
    setNewUserName('');
    fetchData(activeOrganizationId);
  };

  if (isLoadingAuth) return <div style={{padding:'2rem', color:'var(--text-primary)'}}>Загрузка авторизации...</div>;

  if (!session) {
    return <AuthScreen />;
  }

  if (!isDataLoading && !currentUser && profileSyncError) {
    return (
      <div style={{padding:'2rem', color:'var(--text-primary)', display: 'grid', gap: '1rem', maxWidth: 520}}>
        <strong>Не удалось синхронизировать профиль</strong>
        <span style={{color: 'var(--text-secondary)'}}>{profileSyncError}</span>
        <div style={{display: 'flex', gap: '0.75rem', flexWrap: 'wrap'}}>
          <button className="btn btn-primary" onClick={() => fetchData(activeOrganizationId)}>Повторить</button>
          <button className="btn" onClick={handleLogout}>Выйти</button>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <div style={{padding:'2rem', color:'var(--text-primary)'}}>Синхронизация профиля...</div>;
  }

  const activeProject = projects.find(p => p.id === activeProjectId);
  const activeOrganization = organizations.find(organization => organization.id === activeOrganizationId);
  const activeOrganizationMembers = organizationMembers.filter(member => member.organization_id === activeOrganizationId);
  const activeOrganizationUserIds = new Set(activeOrganizationMembers.map(member => member.user_id));
  const organizationUsers = users.filter(user => activeOrganizationUserIds.has(user.id));
  const currentOrganizationMember = activeOrganizationMembers.find(member => member.user_id === currentUser.id);
  const currentOrganizationRole = currentOrganizationMember?.role;
  const firstOrganization = organizations[0];
  const isSuperAdmin = Boolean(
    currentUser.is_super_admin
    || (currentUser.role === 'Администратор' && firstOrganization?.owner_id === currentUser.id)
  );

  const hasPermission = (role, permissionName, defaultValue) => {
    if (isSuperAdmin || currentOrganizationRole === 'owner') return true;
    const rolePerm = rolePermissions.find(p => p.organization_id === activeOrganizationId && p.role === role);
    if (rolePerm && rolePerm.permissions && rolePerm.permissions[permissionName] !== undefined) {
      return rolePerm.permissions[permissionName];
    }
    return defaultValue;
  };

  const canManageOrganization = isSuperAdmin 
    || ['owner', 'admin', 'project_manager'].includes(currentOrganizationRole)
    || hasPermission(currentUser?.role, 'manage_projects', false);

  const canCreateProjects = isSuperAdmin 
    || ['owner', 'admin', 'project_manager'].includes(currentOrganizationRole)
    || hasPermission(currentUser?.role, 'create_projects', false);

  const canManageOrganizationStaff = isSuperAdmin 
    || ['owner', 'admin', 'project_manager'].includes(currentOrganizationRole)
    || hasPermission(currentUser?.role, 'manage_staff', false);

  const visibleOrganizationUsers = organizationUsers.filter(user => isSuperAdmin || !user.is_super_admin);
  const visibleProjects = projects.filter(project => project.organization_id === activeOrganizationId);
  const projectStages = stages.filter(s => s.project_id === activeProjectId).sort((a, b) => a.order - b.order);
  const projectTasks = tasks.filter(t => projectStages.some(s => s.id === t.stage_id));
  const projectMetrics = getProjectMetrics(projectStages, projectTasks);
  const selectedTask = tasks.find(t => t.id === selectedTaskId);
  const projectTaskIds = new Set(projectTasks.map(task => task.id));
  const projectFiles = taskFiles.filter(file => projectTaskIds.has(file.task_id));
  const activeProjectMembers = projectMembers.filter(member => member.project_id === activeProjectId);
  const activeProjectLogs = projectLogs.filter(log => log.project_id === activeProjectId);
  const isProjectLead = activeProjectMembers.some(member => member.user_id === currentUser.id && member.role === 'Руководитель проекта');

  const canManageStages = canManageOrganization 
    || isProjectLead 
    || hasPermission(currentUser?.role, 'manage_stages', false);

  const canManageTasks = canManageOrganization 
    || isProjectLead 
    || activeProjectMembers.some(member => member.user_id === currentUser?.id && member.role === 'Менеджер проекта') 
    || hasPermission(currentUser?.role, 'manage_tasks', true);

  const canManageVisualizations = canManageOrganization 
    || isProjectLead 
    || hasPermission(currentUser?.role, 'manage_visualizations', false);

  const visibleProjectMembers = activeProjectMembers.filter(member => {
    const user = users.find(item => item.id === member.user_id);
    return isSuperAdmin || !user?.is_super_admin;
  });
  
  const canManageProjectMembers = canManageOrganization || isProjectLead || hasPermission(currentUser?.role, 'manage_staff', false);
  const canConfigureNotificationChannels = canManageProjectMembers || canManageOrganizationStaff;
  
  const canRenameProject = (projectId) => canManageOrganization || hasPermission(currentUser?.role, 'manage_projects', false) || projectMembers.some(member =>
    member.project_id === projectId &&
    member.user_id === currentUser?.id &&
    member.role === 'Руководитель проекта'
  );
  
  const getUserInitials = (name) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : '?';
  const getUser = (id) => users.find(u => u.id === id);
  const activeProjectMemberIds = new Set(activeProjectMembers.map(member => member.user_id));
  const canUseProjectChat = Boolean(activeProjectId) && (
    activeProjectMemberIds.has(currentUser.id)
    || canManageOrganization
    || currentOrganizationRole === 'project_manager'
  );
  const messengerUsers = visibleOrganizationUsers.filter(user => user.id !== currentUser.id);
  const selectedMessengerUsers = selectedMessengerUserIds
    .map(id => getUser(id))
    .filter(Boolean);
  const conversationParticipantIds = [currentUser.id, ...selectedMessengerUserIds].sort();
  const conversationTitle = selectedMessengerUsers.length
    ? selectedMessengerUsers.map(user => user.name || user.email).join(', ')
    : `Общий чат${activeProject ? `: ${activeProject.name}` : ''}`;
  const getMessageParticipants = (message) => Array
    .from(new Set([message.author_id, ...(message.recipient_ids || [])]))
    .filter(Boolean)
    .sort();
  const isSameParticipantSet = (left, right) => left.length === right.length && left.every((item, index) => item === right[index]);
  const conversationMessages = siteMessages.filter(message => {
    const recipients = message.recipient_ids || [];
    if (selectedMessengerUserIds.length === 0) {
      return recipients.length === 0 && message.project_id === activeProjectId;
    }
    return isSameParticipantSet(getMessageParticipants(message), conversationParticipantIds);
  });
  const handleMessengerRecipientSelect = (userId, isGroupSelect = false) => {
    if (!isGroupSelect) {
      setSelectedMessengerUserIds([userId]);
      return;
    }

    setSelectedMessengerUserIds(currentIds => (
      currentIds.includes(userId)
        ? currentIds.filter(id => id !== userId)
        : [...currentIds, userId]
    ));
  };
  const handleMessengerDragStart = (e) => {
    if (e.target.closest('button')) return;
    setIsDraggingMessenger(true);
    setMessengerDragOffset({
      x: e.clientX - messengerWindow.x,
      y: e.clientY - messengerWindow.y
    });
  };
  const handleMessengerResizeStart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingMessenger(true);
    setMessengerResizeStart({
      mouseX: e.clientX,
      mouseY: e.clientY,
      x: messengerWindow.x,
      y: messengerWindow.y,
      width: messengerChatSize.width,
      height: messengerChatSize.height
    });
  };

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

  const handleSendSiteMessage = async (e) => {
    e.preventDefault();
    const body = messengerText.trim();
    if (!body || !currentUser?.id || isSendingMessage) return;
    if (!activeOrganizationId) {
      alert('Сначала выберите организацию');
      return;
    }
    if (selectedMessengerUserIds.length === 0 && !canUseProjectChat) {
      alert('Общий чат доступен только участникам активного проекта');
      return;
    }

    setIsSendingMessage(true);
    const projectId = selectedMessengerUserIds.length === 0 ? activeProjectId : null;
    const optimisticMessage = {
      id: `local-${Date.now()}`,
      author_id: currentUser.id,
      recipient_ids: selectedMessengerUserIds,
      project_id: projectId,
      organization_id: activeOrganizationId,
      body,
      created_at: new Date().toISOString(),
      isLocal: true
    };
    setSiteMessages([...siteMessages, optimisticMessage]);
    setMessengerText('');

    const { data, error } = await supabase
      .from('site_messages')
      .insert([{
        author_id: currentUser.id,
        recipient_ids: selectedMessengerUserIds,
        project_id: projectId,
        organization_id: activeOrganizationId,
        body
      }])
      .select()
      .single();

    setIsSendingMessage(false);

    if (error) {
      setSiteMessages(siteMessages);
      setMessengerText(body);
      alert('Ошибка отправки сообщения: ' + error.message);
      return;
    }

    setSiteMessages(currentMessages => currentMessages.map(message => message.id === optimisticMessage.id ? data : message));
    const { data: notificationData, error: notificationError } = await supabase.functions.invoke('dispatch-message-notifications', {
      body: { messageId: data.id }
    });
    if (notificationError) {
      console.warn('Ошибка отправки внешних уведомлений:', notificationError.message);
    } else if (notificationData?.results) {
      console.info('Внешние уведомления:', notificationData.results);
    }
  };

  const handlePanelDragStart = (e) => {
    if (e.target.tagName.toLowerCase() === 'button') return;
    setIsDraggingPanel(true);
    setPanelDragOffset({ x: e.clientX - panelPos.x, y: e.clientY - panelPos.y });
  };

  const handleSelectTask = (task) => {
    setSelectedTaskId(task.id);
  };

  const handleMapBackgroundClick = () => {
    if (selectedTaskId) {
      setSelectedTaskId(null);
    }
  };

  const handleCreateOrganization = async (e) => {
    e.preventDefault();
    if (!isSuperAdmin) return;

    const name = newOrganizationName.trim();
    if (!name) {
      alert('Введите название организации');
      return;
    }

    const { data: organizationData, error: organizationError } = await supabase
      .from('organizations')
      .insert([{ name, owner_id: currentUser.id }])
      .select()
      .single();

    if (organizationError) {
      alert('Ошибка создания организации: ' + organizationError.message);
      return;
    }

    const organizationMemberRows = [
      { organization_id: organizationData.id, user_id: currentUser.id, role: 'owner' }
    ];

    if (organizationManagerId && organizationManagerId !== currentUser.id) {
      organizationMemberRows.push({
        organization_id: organizationData.id,
        user_id: organizationManagerId,
        role: 'project_manager'
      });
    }

    const { error: membersError } = await supabase
      .from('organization_members')
      .upsert(organizationMemberRows, { onConflict: 'organization_id,user_id' });

    if (membersError) {
      alert('Организация создана, но участники не добавлены: ' + membersError.message);
    }

    if (organizationManagerId) {
      const manager = users.find(user => user.id === organizationManagerId);
      if (manager && manager.role !== 'Администратор') {
        await supabase.from('profiles').update({ role: 'Менеджер проектов' }).eq('id', organizationManagerId);
      }
    }

    setNewOrganizationName('');
    setOrganizationManagerId('');
    setActiveOrganizationId(organizationData.id);
    fetchData(organizationData.id);
  };

  const handleAddProject = async () => {
    if (!activeOrganizationId) {
      alert('Сначала выберите или создайте организацию');
      return;
    }

    if (!canCreateProjects) {
      alert('У вас нет прав для создания проектов');
      return;
    }
    const { data, error } = await supabase.from('projects').insert([{ name: 'Новый проект', status: 'В работе', color: '#3b82f6', organization_id: activeOrganizationId }]).select();
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

  const handleNotificationChannelChange = async (user, channel, enabled) => {
    if (!user?.id || !canConfigureNotificationChannels) return;

    const nextChannels = {
      ...getNotificationChannels(user),
      [channel]: enabled
    };

    setUsers(users.map(item => item.id === user.id ? { ...item, notification_channels: nextChannels } : item));

    const { data, error } = await supabase.functions.invoke('update-user-profile', {
      body: {
        userId: user.id,
        name: user.name,
        phone: user.phone,
        telegram: user.telegram,
        role: user.role || 'Сотрудник',
        avatar_color: user.avatar_color,
        avatar_url: user.avatar_url,
        notification_channels: nextChannels
      }
    });

    if (error) {
      setUsers(users);
      alert('Ошибка сохранения каналов уведомлений: ' + error.message);
      return;
    }

    if (data?.profile) {
      setUsers(currentUsers => currentUsers.map(item => item.id === user.id ? { ...item, ...data.profile } : item));
      if (adminEditingUser?.id === user.id) {
        setAdminEditingUser(currentEditingUser => currentEditingUser ? { ...currentEditingUser, ...data.profile } : currentEditingUser);
      }
    }
  };

  const updateActiveOrganizationChannels = (channel, updates) => {
    if (!activeOrganization) return;

    const currentChannels = getOrganizationNotificationChannels(activeOrganization);
    const nextChannels = {
      ...currentChannels,
      [channel]: {
        ...currentChannels[channel],
        ...updates
      }
    };

    setOrganizations(organizations.map(organization => (
      organization.id === activeOrganization.id
        ? { ...organization, notification_channels: nextChannels }
        : organization
    )));
  };

  const handleSaveOrganizationChannels = async () => {
    if (!activeOrganization || !canManageOrganizationStaff) return;
    const notification_channels = getOrganizationNotificationChannels(activeOrganization);

    if (notification_channels.whatsapp.enabled && !isCompletePhone(notification_channels.whatsapp.phone)) {
      alert('Введите полный WhatsApp-номер организации (11 цифр).');
      return;
    }

    if (
      notification_channels.email.enabled
      && notification_channels.email.fromEmail
      && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notification_channels.email.fromEmail.trim().toLowerCase())
    ) {
      alert('Введите корректный Email отправителя организации.');
      return;
    }

    const { data, error } = await supabase
      .from('organizations')
      .update({ notification_channels })
      .eq('id', activeOrganization.id)
      .select()
      .single();

    if (error) {
      alert('Ошибка сохранения каналов организации: ' + error.message);
      return;
    }

    if (data) {
      setOrganizations(organizations.map(organization => organization.id === data.id ? data : organization));
    }

    alert('Каналы организации сохранены');
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

  const canDismissOrganizationUser = (user) => {
    const member = activeOrganizationMembers.find(item => item.user_id === user?.id);
    return Boolean(
      canManageOrganizationStaff
      && member
      && user?.id !== currentUser.id
      && !user?.is_super_admin
      && !['owner', 'admin'].includes(member.role)
    );
  };

  const handleDismissOrganizationUser = async (user) => {
    const member = activeOrganizationMembers.find(item => item.user_id === user?.id);
    if (!member || !canDismissOrganizationUser(user)) return;

    const displayName = user.name || user.email || 'сотрудника';
    if (!window.confirm(`Уволить ${displayName} из организации "${activeOrganization?.name || 'организация'}"?`)) return;

    const organizationProjectIds = visibleProjects.map(project => project.id);
    if (organizationProjectIds.length > 0) {
      const { error: projectMembersError } = await supabase
        .from('project_members')
        .delete()
        .eq('user_id', user.id)
        .in('project_id', organizationProjectIds);

      if (projectMembersError) {
        alert('Не удалось удалить сотрудника из проектов: ' + projectMembersError.message);
        return;
      }
    }

    const { error } = await supabase
      .from('organization_members')
      .delete()
      .eq('id', member.id);

    if (error) {
      alert('Не удалось уволить сотрудника: ' + error.message);
      return;
    }

    setOrganizationMembers(organizationMembers.filter(item => item.id !== member.id));
    setProjectMembers(projectMembers.filter(item => !(item.user_id === user.id && organizationProjectIds.includes(item.project_id))));
    if (adminEditingUser?.id === user.id) {
      setAdminEditingUser(null);
      setAdminEditPassword('');
      setAdminEditPasswordConfirm('');
    }
  };

  const handleDeleteProject = async (id) => {
    if (!canManageOrganization) return;
    if (!window.confirm("Удалить проект и все его задачи?")) return;
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (!error) {
      setProjects(projects.filter(p => p.id !== id));
      if (activeProjectId === id) setActiveProjectId(null);
    }
  };

  const handleProjectColorChange = async (project, color) => {
    if (!project || project.color === color) return;
    if (!canCreateProjects) {
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

  const startProjectNameEdit = (project) => {
    if (!project || !canRenameProject(project.id)) return;
    skipProjectNameSaveRef.current = false;
    setEditingProjectId(project.id);
    setEditingProjectName(project.name || '');
  };

  const cancelProjectNameEdit = () => {
    skipProjectNameSaveRef.current = true;
    setEditingProjectId(null);
    setEditingProjectName('');
  };

  const saveProjectNameEdit = async (project) => {
    if (skipProjectNameSaveRef.current) {
      skipProjectNameSaveRef.current = false;
      return;
    }
    if (!project || editingProjectId !== project.id) return;
    if (!canRenameProject(project.id)) {
      cancelProjectNameEdit();
      return;
    }

    const nextName = editingProjectName.trim();
    const previousName = project.name || '';
    if (!nextName) {
      setEditingProjectName(previousName);
      return;
    }

    cancelProjectNameEdit();
    if (nextName === previousName) return;

    setProjects(projects.map(item => item.id === project.id ? { ...item, name: nextName } : item));

    const { error } = await supabase.from('projects').update({ name: nextName }).eq('id', project.id);
    if (error) {
      setProjects(projects);
      alert('Ошибка изменения названия проекта: ' + error.message);
      return;
    }

    appendProjectLog({
      projectId: project.id,
      action: 'update_project',
      entityType: 'project',
      entityId: project.id,
      entityName: nextName,
      details: { changes: [{ field: 'name', label: 'Название проекта', from: previousName, to: nextName }] }
    });
  };

  const handleDeleteStage = async (stage) => {
    if (!canManageOrganization && !isProjectLead) return;
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

  const handleCreateVisualization = async () => {
    if (!canManageVisualizations) return;
    const name = prompt('Название новой визуализации:', 'Новый дашборд');
    if (!name) return;
    
    const newVis = {
      project_id: activeProjectId,
      name,
      content: '<h1>Привет, мир!</h1>\n<p>Здесь можно писать HTML, CSS и JS.</p>',
      created_by: currentUser.id
    };
    
    const { data, error } = await supabase.from('project_visualizations').insert([newVis]).select();
    if (error) {
      alert('Ошибка создания: ' + error.message);
      return;
    }
    if (data && data.length > 0) {
      setVisualizations([data[0], ...visualizations]);
      setSelectedVisualization(data[0]);
    }
  };

  const handleDeleteVisualization = async (visId) => {
    if (!canManageVisualizations) return;
    if (!window.confirm('Точно удалить эту визуализацию?')) return;
    
    const { error } = await supabase.from('project_visualizations').delete().eq('id', visId);
    if (error) {
      alert('Ошибка удаления: ' + error.message);
      return;
    }
    setVisualizations(visualizations.filter(v => v.id !== visId));
    if (selectedVisualization?.id === visId) {
      setSelectedVisualization(null);
    }
  };

  const handleUpdateVisualization = async (visId, content) => {
    if (!canManageVisualizations) return;
    const { error } = await supabase.from('project_visualizations').update({ content, updated_at: new Date().toISOString() }).eq('id', visId);
    if (error) {
      alert('Ошибка сохранения: ' + error.message);
      return;
    }
    setVisualizations(visualizations.map(v => v.id === visId ? { ...v, content, updated_at: new Date().toISOString() } : v));
  };

  const handleTogglePermission = (role, permKey) => {
    const existing = rolePermissions.find(p => p.organization_id === activeOrganizationId && p.role === role);
    
    let nextPermissions = {};
    if (existing && existing.permissions) {
      nextPermissions = { ...existing.permissions };
    } else {
      const isManagerOrAdmin = ['Администратор', 'Менеджер проектов'].includes(role);
      nextPermissions = {
        create_projects: isManagerOrAdmin,
        manage_projects: isManagerOrAdmin,
        manage_staff: isManagerOrAdmin,
        manage_stages: isManagerOrAdmin,
        manage_tasks: true,
        manage_visualizations: isManagerOrAdmin
      };
    }
    
    nextPermissions[permKey] = !nextPermissions[permKey];
    
    if (existing) {
      setRolePermissions(rolePermissions.map(p => 
        (p.organization_id === activeOrganizationId && p.role === role)
          ? { ...p, permissions: nextPermissions }
          : p
      ));
    } else {
      const newPermRecord = {
        organization_id: activeOrganizationId,
        role,
        permissions: nextPermissions
      };
      setRolePermissions([...rolePermissions, newPermRecord]);
    }
  };

  const handleSaveRolePermissions = async () => {
    const orgPermissions = rolePermissions.filter(p => p.organization_id === activeOrganizationId);
    
    setIsSavingPermissions(true);
    try {
      const { error } = await supabase
        .from('role_permissions')
        .upsert(orgPermissions.map(({ organization_id, role, permissions }) => ({
          organization_id,
          role,
          permissions
        })), { onConflict: 'organization_id,role' });

      if (error) {
        alert('Ошибка при сохранении прав: ' + error.message);
      } else {
        alert('Права ролей успешно сохранены!');
      }
    } catch (err) {
      alert('Произошла непредвиденная ошибка: ' + err.message);
    } finally {
      setIsSavingPermissions(false);
    }
  };

  const handleDeleteTask = async (task) => {
    if (!canManageOrganization && !isProjectLead) return;
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

  const clockTime = new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: clockTimeZone
  }).format(clockNowMs);
  const clockDate = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    timeZone: clockTimeZone
  }).format(clockNowMs);
  const clockSyncTitle = clockSyncState.syncedAt
    ? `Синхронизировано: ${new Date(clockSyncState.syncedAt).toLocaleTimeString('ru-RU')}, источник: ${clockSyncState.source}`
    : 'Синхронизация времени...';
  const renderNotificationChannelControls = (user) => {
    const notificationChannels = getNotificationChannels(user);
    const channelAvailability = {
      telegram: Boolean(user?.telegram),
      whatsapp: Boolean(user?.phone),
      email: Boolean(user?.email)
    };

    return (
      <div className="project-member-notifications">
        <div>
          <div className="project-member-section-title">Уведомления</div>
          <p>Каналы для сообщений корпоративного мессенджера</p>
        </div>
        <div className="notification-channel-list">
          {Object.keys(defaultNotificationChannels).map(channel => {
            const isAvailable = channelAvailability[channel];
            const isEnabled = Boolean(notificationChannels[channel]) && isAvailable;
            return (
              <label key={channel} className={`notification-channel ${isEnabled ? 'active' : ''} ${!isAvailable ? 'disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={isEnabled}
                  disabled={!canConfigureNotificationChannels || !isAvailable}
                  onChange={(e) => handleNotificationChannelChange(user, channel, e.target.checked)}
                />
                <span>{notificationChannelLabels[channel]}</span>
                {!isAvailable && <em>нет контакта</em>}
              </label>
            );
          })}
        </div>
      </div>
    );
  };
  const renderOrganizationChannelSettings = () => {
    if (!activeOrganization) return null;
    const channels = getOrganizationNotificationChannels(activeOrganization);

    return (
      <div className="organization-channel-panel">
        <div className="organization-channel-header">
          <div>
            <h4>Каналы организации</h4>
            <p>Здесь включаются внешние уведомления и необязательные каналы организации.</p>
          </div>
          <button className="btn btn-primary" type="button" onClick={handleSaveOrganizationChannels}>Сохранить</button>
        </div>
        <div className="organization-channel-grid">
          <section className={`organization-channel-card ${channels.telegram.enabled ? 'active' : ''}`}>
            <label className="organization-channel-toggle">
              <input
                type="checkbox"
                checked={channels.telegram.enabled}
                onChange={(e) => updateActiveOrganizationChannels('telegram', { enabled: e.target.checked })}
              />
              <span>Telegram</span>
            </label>
            <p className="organization-channel-hint">
              Личные уведомления отправляет общий бот приложения. Канал ниже нужен только для копии уведомлений в общий чат организации.
            </p>
            <input
              className="edit-select"
              value={channels.telegram.destination}
              onChange={(e) => updateActiveOrganizationChannels('telegram', { destination: e.target.value })}
              placeholder="@channel или chat_id организации"
            />
          </section>
          <section className={`organization-channel-card ${channels.whatsapp.enabled ? 'active' : ''}`}>
            <label className="organization-channel-toggle">
              <input
                type="checkbox"
                checked={channels.whatsapp.enabled}
                onChange={(e) => updateActiveOrganizationChannels('whatsapp', { enabled: e.target.checked })}
              />
              <span>WhatsApp</span>
            </label>
            <input
              className="edit-select"
              value={channels.whatsapp.sender}
              onChange={(e) => updateActiveOrganizationChannels('whatsapp', { sender: e.target.value })}
              placeholder="Название отправителя"
            />
            <input
              className="edit-select"
              value={formatPhone(channels.whatsapp.phone)}
              onChange={(e) => updateActiveOrganizationChannels('whatsapp', { phone: formatPhone(e.target.value) })}
              placeholder="+7 (999) 000-00-00"
              maxLength={18}
            />
          </section>
          <section className={`organization-channel-card ${channels.email.enabled ? 'active' : ''}`}>
            <label className="organization-channel-toggle">
              <input
                type="checkbox"
                checked={channels.email.enabled}
                onChange={(e) => updateActiveOrganizationChannels('email', { enabled: e.target.checked })}
              />
              <span>Email</span>
            </label>
            <input
              className="edit-select"
              value={channels.email.fromName}
              onChange={(e) => updateActiveOrganizationChannels('email', { fromName: e.target.value })}
              placeholder="Имя отправителя"
            />
            <input
              className="edit-select"
              type="email"
              value={channels.email.fromEmail}
              onChange={(e) => updateActiveOrganizationChannels('email', { fromEmail: e.target.value })}
              placeholder="notify@company.ru"
            />
            <input
              className="edit-select"
              type="email"
              value={channels.email.replyTo}
              onChange={(e) => updateActiveOrganizationChannels('email', { replyTo: e.target.value })}
              placeholder="reply-to, если отличается"
            />
          </section>
        </div>
      </div>
    );
  };

  return (
    <LazyMotion features={domAnimation}>
    <div className="app-container">
      <header className="topbar">
        <div className="brand" onClick={() => setActiveView('map')} style={{cursor:'pointer'}}>Orbite Planing</div>
        
        <div className="topbar-actions">
          <div className="topbar-clock" ref={clockMenuRef} title={clockSyncTitle}>
            <button
              type="button"
              className="topbar-clock-face"
              aria-label="Часы и выбор часового пояса"
              aria-expanded={isClockZoneMenuOpen}
              onClick={() => setIsClockZoneMenuOpen(isOpen => !isOpen)}
            >
              <div className="topbar-clock-main">
                <span className="topbar-clock-time">{clockTime}</span>
                <span className="topbar-clock-separator" aria-hidden="true">|</span>
                <span className="topbar-clock-date">{clockDate}</span>
              </div>
            </button>
            {isClockZoneMenuOpen && (
              <div className="topbar-clock-menu">
                <label className="topbar-clock-zone-label" htmlFor="clock-time-zone">Часовой пояс</label>
                <select
                  id="clock-time-zone"
                  className="topbar-clock-zone"
                  value={clockTimeZone}
                  aria-label="Часовой пояс"
                  onChange={(e) => {
                    setClockTimeZone(e.target.value);
                    setIsClockZoneMenuOpen(false);
                  }}
                >
                  {getClockTimeZones().map(timeZone => (
                    <option key={timeZone} value={timeZone}>{formatTimeZoneLabel(timeZone)}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {canManageOrganizationStaff && (
            <button 
              className={`btn ${activeView === 'admin' ? 'active' : ''}`}
              style={{background: 'rgba(255,255,255,0.05)', border: '1px solid var(--panel-border)'}}
              onClick={() => setActiveView(activeView === 'admin' ? 'map' : 'admin')}
            >
              {activeView === 'admin' ? '← Назад к проектам' : '⚙ Админ-панель'}
            </button>
          )}

          <button
            className={`btn btn-icon messenger-trigger ${isMessengerOpen ? 'active' : ''} ${hasUnreadMessages ? 'unread' : ''}`}
            title="Мессенджер"
            aria-label="Мессенджер"
            onClick={() => {
              const nextOpenState = !isMessengerOpen;
              setIsMessengerOpen(nextOpenState);
              if (nextOpenState) setHasUnreadMessages(false);
            }}
          >
            <svg className="messenger-trigger-icon" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3.3 7.8A2.3 2.3 0 0 1 5.6 5.5h12.8a2.3 2.3 0 0 1 2.3 2.3v8.4a2.3 2.3 0 0 1-2.3 2.3H5.6a2.3 2.3 0 0 1-2.3-2.3V7.8Z" />
              <path d="m4.4 7 7.6 5.9L19.6 7" />
              <path d="m9.9 11.3-5.3 5" />
              <path d="m14.1 11.3 5.3 5" />
            </svg>
          </button>

          <div 
            className={`user-profile ${isProfileOpen ? 'active' : ''}`}
            title="Личный кабинет" 
            onClick={() => setIsProfileOpen(true)}
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

      {dataLoadError && (
        <div className="workspace-error-banner" role="status">
          <span>{dataLoadError}</span>
          <div className="workspace-error-actions">
            <button className="btn" type="button" onClick={() => fetchData(activeOrganizationId)}>Повторить</button>
            <button className="btn" type="button" onClick={handleLogout}>Выйти</button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {isMessengerOpen && (
          <ErrorBoundary>
            <MessengerPanel
              currentUser={currentUser}
              users={users}
              activeProjectId={activeProjectId}
              activeProject={activeProject}
              activeOrganizationId={activeOrganizationId}
              siteMessages={siteMessages}
              setSiteMessages={setSiteMessages}
              isMessengerOpen={isMessengerOpen}
              setIsMessengerOpen={setIsMessengerOpen}
              shouldReduceMotion={shouldReduceMotion}
              supabase={supabase}
              canManageOrganization={canManageOrganization}
              currentOrganizationRole={currentOrganizationRole}
              activeProjectMembers={projectMembers}
              visibleOrganizationUsers={visibleOrganizationUsers}
            />
          </ErrorBoundary>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isProfileOpen && (
          <m.div
            className="profile-modal-layer"
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
          >
            <m.div className="profile-modal-backdrop" onClick={() => setIsProfileOpen(false)} />
            <m.div
              ref={profileModalRef}
              className="profile-modal glass-panel"
              role="dialog"
              aria-modal="true"
              aria-label="Личный кабинет"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 10, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button className="profile-modal-close btn btn-icon" type="button" title="Закрыть" onClick={() => setIsProfileOpen(false)}>
                ×
              </button>
              <ProfilePanel
                currentUser={currentUser}
                users={users}
                setUsers={setUsers}
                setCurrentUser={setCurrentUser}
              />
              <div className="modal-resize-handle-visual">
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <path d="M10,0 L0,10 M10,3 L3,10 M10,6 L6,10" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
                </svg>
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>

      <div className="main-area">
        {activeView === 'map' && (
          <aside className="glass-panel sidebar-left">
            <div className="panel-header">
              <h2>Проекты</h2>
              <button className="btn btn-icon" title="Создать проект" onClick={handleAddProject}>+</button>
            </div>
            <div className="panel-content">
              {isSuperAdmin && (
                <div className="organization-switcher">
                  <div className="detail-label">Организация</div>
                  <select
                    className="edit-select organization-select"
                    value={activeOrganizationId || ''}
                    onChange={(e) => {
                      const nextOrganizationId = e.target.value || null;
                      const nextProject = projects.find(project => project.organization_id === nextOrganizationId);
                      setActiveOrganizationId(nextOrganizationId);
                      setActiveProjectId(nextProject?.id || null);
                      setSelectedTaskId(null);
                    }}
                  >
                    {organizations.map(organization => (
                      <option key={organization.id} value={organization.id}>{organization.name}</option>
                    ))}
                  </select>
                  {activeOrganization && (
                    <div className="organization-switcher-meta">
                      {organizationRoleLabels[currentOrganizationRole] || 'Участник'} · {activeOrganizationMembers.length} сотрудников
                    </div>
                  )}
                </div>
              )}
              <div className="project-list">
                {visibleProjects.map(project => {
                  const projectTasks = tasks.filter(t => stages.some(s => s.project_id === project.id && s.id === t.stage_id));
                  const overdueCount = projectTasks.filter(t => t.status === 'overdue').length;
                  const isEditingProjectName = editingProjectId === project.id;
                  const canEditProjectName = canRenameProject(project.id);
                  return (
                    <div
                      key={project.id}
                      className={`project-item ${activeProjectId === project.id ? 'active' : ''}`}
                      style={{ '--project-color': project.color || '#3b82f6' }}
                      onClick={() => { setActiveProjectId(project.id); setSelectedTaskId(null); }}
                    >
	                      {canCreateProjects && (
                        <label className="project-side-color-control" title="Изменить цвет проекта" onClick={(e) => e.stopPropagation()}>
                          <input type="color" value={project.color || '#3b82f6'} onChange={(e) => handleProjectColorChange(project, e.target.value)} />
                        </label>
                      )}
                      <div className="project-item-top">
                        <div className="project-title-group">
                          {isEditingProjectName ? (
                            <input
                              className="project-name-input compact"
                              value={editingProjectName}
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setEditingProjectName(e.target.value)}
                              onBlur={() => saveProjectNameEdit(project)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.currentTarget.blur();
                                if (e.key === 'Escape') cancelProjectNameEdit();
                              }}
                            />
                          ) : (
                            <button
                              type="button"
                              className={`project-name ${canEditProjectName ? 'editable' : ''}`}
                              onClick={(e) => {
                                if (!canEditProjectName) return;
                                e.stopPropagation();
                                startProjectNameEdit(project);
                              }}
                              title={canEditProjectName ? 'Изменить название проекта' : project.name}
                            >
                              {project.name}
                            </button>
                          )}
                        </div>
                        <div className="project-actions" onClick={(e) => e.stopPropagation()}>
                          {canEditProjectName && !isEditingProjectName && (
                            <button className="btn btn-icon project-edit-btn" title="Переименовать проект" onClick={() => startProjectNameEdit(project)}>
                              ✎
                            </button>
                          )}
	                          {canManageOrganization && (
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
                {visibleProjects.length === 0 && (
                  <div className="empty-state">В этой организации пока нет проектов</div>
                )}
              </div>
            </div>
          </aside>
        )}

        <main className="glass-panel main-content" onClick={handleMapBackgroundClick}>
          
          {/* ADMIN VIEW */}
          {activeView === 'admin' && canManageOrganizationStaff && (
            <>
              <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2>Панель администратора</h2>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    className={`btn ${adminActiveTab === 'users' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setAdminActiveTab('users')}
                  >
                    Сотрудники
                  </button>
                  <button 
                    className={`btn ${adminActiveTab === 'permissions' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setAdminActiveTab('permissions')}
                  >
                    Настройка прав
                  </button>
                </div>
              </div>
              <div className="panel-content" style={{ display: 'block' }}>
                {adminActiveTab === 'users' && (
                  <div style={{ display: 'flex', gap: '2rem' }}>
                    <div style={{flex: 2}}>
	                  <section className="admin-organization-panel">
	                    <div>
	                      <h3>Организации</h3>
	                      <p>{isSuperAdmin ? 'Создайте группу и назначьте проектного менеджера, который сможет вести проекты внутри неё.' : 'Управляйте сотрудниками выбранной организации.'}</p>
	                    </div>
	                    {isSuperAdmin && (
	                      <form className="admin-organization-form" onSubmit={handleCreateOrganization}>
	                        <input
	                          className="auth-input"
	                          style={{marginBottom: 0}}
	                          type="text"
	                          placeholder="Название организации"
	                          value={newOrganizationName}
	                          onChange={(e) => setNewOrganizationName(e.target.value)}
	                          required
	                        />
	                        <select
	                          className="edit-select"
	                          value={organizationManagerId}
	                          onChange={(e) => setOrganizationManagerId(e.target.value)}
	                        >
	                          <option value="">Проектный менеджер позже</option>
	                          {users.filter(user => !user.is_super_admin).map(user => (
	                            <option key={user.id} value={user.id}>{user.name || user.email}</option>
	                          ))}
	                        </select>
	                        <button className="btn btn-primary" type="submit">Создать организацию</button>
	                      </form>
	                    )}
	                    <div className="admin-organization-list">
	                      {organizations.map(organization => {
	                        const organizationCardMembers = organizationMembers.filter(member => member.organization_id === organization.id);
	                        const members = organizationCardMembers.filter(member => isSuperAdmin || !getUser(member.user_id)?.is_super_admin);
	                        const manager = members
                          .filter(member => member.role === 'project_manager')
                          .map(member => getUser(member.user_id)?.name || getUser(member.user_id)?.email)
                          .filter(Boolean)
                          .join(', ');
                        return (
                          <button
                            key={organization.id}
                            type="button"
                            className={`admin-organization-item ${organization.id === activeOrganizationId ? 'active' : ''}`}
	                            onClick={() => {
	                              setActiveOrganizationId(organization.id);
	                              setAdminEditingUser(null);
	                              setAdminEditPassword('');
	                              setAdminEditPasswordConfirm('');
	                            }}
	                          >
                            <strong>{organization.name}</strong>
                            <span>{members.length} сотрудников{manager ? ` · PM: ${manager}` : ''}</span>
                          </button>
                        );
                      })}
                    </div>
                    {renderOrganizationChannelSettings()}
                  </section>

	                  <h3 style={{marginBottom: '1rem'}}>
	                    Сотрудники организации{activeOrganization ? `: ${activeOrganization.name}` : ''}
	                  </h3>
	                  <table className="admin-table">
                    <thead>
                      <tr><th>Сотрудник</th><th>Email</th><th>Телефон</th><th>Действия</th></tr>
                    </thead>
                    <tbody>
		                      {visibleOrganizationUsers.map(u => (
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
                          <td>{formatPhone(u.phone) || '—'}</td>
	                          <td>
		                            <div className="admin-table-actions">
                              {canManageOrganizationStaff && (
                                <button className="btn btn-icon" onClick={() => {
                                  setAdminEditingUser(u);
                                  setAdminEditPassword('');
                                  setAdminEditPasswordConfirm('');
                                }} title="Редактировать сотрудника">✏️</button>
                              )}
	                              {canDismissOrganizationUser(u) && (
	                                <button className="btn btn-icon danger" onClick={() => handleDismissOrganizationUser(u)} title="Уволить из организации">✕</button>
	                              )}
	                            </div>
	                          </td>
                        </tr>
	                      ))}
		                      {visibleOrganizationUsers.length === 0 && (
	                        <tr>
	                          <td colSpan="4">
	                            <div className="empty-state">В выбранной организации пока нет сотрудников</div>
	                          </td>
	                        </tr>
	                      )}
                    </tbody>
                  </table>
                </div>

                <div style={{flex: 1, borderLeft: '1px solid var(--panel-border)', paddingLeft: '2rem'}}>
		                  {canManageOrganizationStaff ? (adminEditingUser ? (
                    <div>
                      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: '1rem'}}>
                        <h3>Редактирование: {adminEditingUser.name}</h3>
                        <button className="btn btn-icon" onClick={() => {
                          setAdminEditingUser(null);
                          setAdminEditPassword('');
                          setAdminEditPasswordConfirm('');
                        }}>✕</button>
                      </div>
                      <div className="detail-section">
                        <div className="detail-label">ФИО</div>
                        <input className="edit-select" value={adminEditingUser.name || ''} onChange={e => setAdminEditingUser({...adminEditingUser, name: e.target.value})} />
                      </div>
                      <div className="detail-section">
                        <div className="detail-label">Email для входа</div>
                        <input className="edit-select" type="email" value={adminEditingUser.email || ''} onChange={e => setAdminEditingUser({...adminEditingUser, email: e.target.value})} />
                      </div>
                      <div className="detail-section">
                        <div className="detail-label">Телефон</div>
                        <input
                          className="edit-select"
                          value={formatPhone(adminEditingUser.phone)}
                          onChange={e => setAdminEditingUser({...adminEditingUser, phone: formatPhone(e.target.value)})}
                          placeholder="+7 (999) 000-00-00"
                          maxLength={18}
                        />
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
                        <div className="detail-label">Новый пароль</div>
                        <input
                          className="edit-select"
                          type="password"
                          value={adminEditPassword}
                          onChange={e => setAdminEditPassword(e.target.value)}
                          placeholder="Оставьте пустым, если не менять"
                          minLength={6}
                        />
                        <input
                          className="edit-select"
                          type="password"
                          value={adminEditPasswordConfirm}
                          onChange={e => setAdminEditPasswordConfirm(e.target.value)}
                          placeholder="Повторите новый пароль"
                          minLength={6}
                        />
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
                      {renderNotificationChannelControls(adminEditingUser)}
                      <button className="btn btn-primary admin-save-btn" onClick={async () => {
                          const { id, email, name, phone, role, avatar_color, avatar_url, notification_channels } = adminEditingUser;
                          const nextEmail = (email || '').trim().toLowerCase();
                          const originalUser = users.find(u => u.id === id);

                          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
                            alert('Введите корректный Email');
                            return;
                          }

                          if (!isCompletePhone(phone)) {
                            alert('Пожалуйста, введите полный номер телефона (11 цифр).');
                            return;
                          }

                          if (nextEmail !== (originalUser?.email || '').toLowerCase()) {
                            const { error: emailError } = await supabase.functions.invoke('update-user-email', {
                              body: { userId: id, email: nextEmail }
                            });

                            if (emailError) {
                              alert('Ошибка изменения Email: ' + emailError.message);
                              return;
                            }
                          }

                          if (adminEditPassword || adminEditPasswordConfirm) {
                            if (adminEditPassword.length < 6) {
                              alert('Пароль должен быть не короче 6 символов');
                              return;
                            }

                            if (adminEditPassword !== adminEditPasswordConfirm) {
                              alert('Пароли не совпадают');
                              return;
                            }

                            const { error: passwordError } = await supabase.functions.invoke('update-user-password', {
                              body: { userId: id, password: adminEditPassword }
                            });

                            if (passwordError) {
                              alert('Ошибка изменения пароля: ' + passwordError.message);
                              return;
                            }
                          }

                          const { data: profileData, error } = await supabase.functions.invoke('update-user-profile', {
                            body: { userId: id, name, phone, telegram: adminEditingUser.telegram, role, avatar_color, avatar_url, notification_channels }
                          });

                          if (!error) {
                             const orgRole = role === 'Администратор' ? 'admin' : (role === 'Менеджер проектов' ? 'project_manager' : 'member');
                             await supabase
                               .from('organization_members')
                               .update({ role: orgRole })
                               .eq('organization_id', activeOrganizationId)
                               .eq('user_id', id);

                             const updatedUser = { ...adminEditingUser, ...(profileData?.profile || {}), email: nextEmail };
                             setUsers(users.map(u => u.id === id ? updatedUser : u));
                             if (id === currentUser.id) setCurrentUser({...currentUser, ...updatedUser});
                             setAdminEditingUser(null);
                             setAdminEditPassword('');
                             setAdminEditPasswordConfirm('');
                          } else {
                             alert('Ошибка: ' + error.message);
                          }
                      }}>Сохранить</button>
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
	                  )) : (
	                    <div className="empty-state">Выберите сотрудника слева, чтобы настроить каналы уведомлений или удалить его из системы.</div>
	                  )}
                </div>
                  </div>
                )}
                
                {adminActiveTab === 'permissions' && (
                  <div className="permissions-settings-panel" style={{ padding: '1rem 0' }}>
                    <div style={{ marginBottom: '1.5rem' }}>
                      <h3>Настройка прав должностей</h3>
                      <p style={{ color: 'var(--text-secondary)' }}>
                        Здесь вы можете гибко настроить права доступа для каждой роли в текущей организации.
                        Суперадминистраторы и Владельцы организации всегда имеют полные права.
                      </p>
                    </div>

                    <div className="table-responsive" style={{ overflowX: 'auto', background: 'var(--panel-bg)', borderRadius: '8px', border: '1px solid var(--panel-border)', marginBottom: '1.5rem' }}>
                      <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid var(--panel-border)', background: 'var(--sidebar-bg)' }}>
                            <th style={{ textAlign: 'left', padding: '1rem' }}>Право доступа</th>
                            {CUSTOMIZABLE_ROLES.map(role => (
                              <th key={role} style={{ textAlign: 'center', padding: '1rem' }}>{role}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {AVAILABLE_PERMISSIONS.map(perm => (
                            <tr key={perm.key} style={{ borderBottom: '1px solid var(--panel-border)' }}>
                              <td style={{ padding: '1rem', fontWeight: '500' }}>
                                {perm.label}
                              </td>
                              {CUSTOMIZABLE_ROLES.map(role => {
                                const rolePerm = rolePermissions.find(p => p.organization_id === activeOrganizationId && p.role === role);
                                let isChecked = false;
                                if (rolePerm && rolePerm.permissions && rolePerm.permissions[perm.key] !== undefined) {
                                  isChecked = rolePerm.permissions[perm.key];
                                } else {
                                  const isManagerOrAdmin = ['Администратор', 'Менеджер проектов'].includes(role);
                                  isChecked = perm.key === 'manage_tasks' ? true : isManagerOrAdmin;
                                }
                                return (
                                  <td key={role} style={{ textAlign: 'center', padding: '1rem' }}>
                                    <input 
                                      type="checkbox" 
                                      checked={isChecked}
                                      onChange={() => handleTogglePermission(role, perm.key)}
                                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                      <button 
                        className="btn btn-primary" 
                        onClick={handleSaveRolePermissions}
                        disabled={isSavingPermissions}
                      >
                        {isSavingPermissions ? 'Сохранение...' : 'Сохранить права'}
                      </button>
                      <button 
                        className="btn btn-outline" 
                        onClick={() => {
                          fetchData();
                        }}
                      >
                        Сбросить изменения
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* MAP VIEW */}
          {activeView === 'map' && (
            <>
              <div className="panel-header project-main-header" style={{ '--project-color': activeProject?.color || '#3b82f6' }}>
                {activeProject && editingProjectId === activeProject.id ? (
                  <input
                    className="project-name-input header"
                    value={editingProjectName}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setEditingProjectName(e.target.value)}
                    onBlur={() => saveProjectNameEdit(activeProject)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                      if (e.key === 'Escape') cancelProjectNameEdit();
                    }}
                  />
                ) : (
                  <h2>
                    {activeProject && canRenameProject(activeProject.id) ? (
                      <button
                        type="button"
                        className="project-header-title editable"
                        onClick={(e) => {
                          e.stopPropagation();
                          startProjectNameEdit(activeProject);
                        }}
                        title="Изменить название проекта"
                      >
                        {activeProject.name}
                      </button>
                    ) : (
                      activeProject?.name || 'Выберите проект'
                    )}
                  </h2>
                )}
                <div className="view-tabs">
                  <button className={`view-tab ${activeProjectView === 'kanban' ? 'active' : ''}`} onClick={() => setActiveProjectView('kanban')}>Канбан (Карта)</button>
                  <button className={`view-tab ${activeProjectView === 'gantt' ? 'active' : ''}`} onClick={() => setActiveProjectView('gantt')}>Диаграмма Ганта</button>
                  <button className={`view-tab ${activeProjectView === 'files' ? 'active' : ''}`} onClick={() => setActiveProjectView('files')}>Файлы</button>
                  <button className={`view-tab ${activeProjectView === 'visualizations' ? 'active' : ''}`} onClick={() => setActiveProjectView('visualizations')}>Визуализации</button>
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
                              {(canManageOrganization || isProjectLead) && (
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
                                <m.div
                                  key={task.id}
                                  className="task-card"
                                  layout={!shouldReduceMotion}
                                  initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                                  style={{ '--task-stage-color': stage.color || '#3b82f6' }}
                                  data-tooltip={task.desc?.trim() || task.name}
                                  onClick={(e) => { e.stopPropagation(); handleSelectTask(task); }}
                                  title={task.desc?.trim() || task.name}
                                >
                                  {task.is_modified && <div className="modified-indicator" title="В задаче были изменения"></div>}
                                  {(canManageOrganization || isProjectLead) && (
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
                                  <div className="task-title">
                                    <span className="task-stage-marker" aria-hidden="true" />
                                    <span>{task.name}</span>
                                  </div>
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
                                </m.div>
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
                {activeProjectView === 'visualizations' && (
                  <div className="project-visualizations-view">
                    {!selectedVisualization ? (
                      <div className="visualizations-grid">
                        {visualizations.filter(v => v.project_id === activeProjectId).map(vis => (
                          <div key={vis.id} className="visualization-card" onClick={() => setSelectedVisualization(vis)}>
                            <div className="visualization-card-header">
                              <h4>{vis.name}</h4>
                              {canManageVisualizations && (
                                <button className="btn btn-icon danger" onClick={(e) => { e.stopPropagation(); handleDeleteVisualization(vis.id); }}>
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M3 6h18" />
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                  </svg>
                                </button>
                              )}
                            </div>
                            <div className="visualization-card-body">
                              <span className="visualization-date">{formatDate(vis.created_at)}</span>
                            </div>
                          </div>
                        ))}
                        {canManageVisualizations && (
                          <div className="visualization-card add-new" onClick={handleCreateVisualization}>
                            <span>+ Создать визуализацию</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="visualization-editor">
                        <div className="visualization-editor-header" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          <button className="btn" onClick={() => setSelectedVisualization(null)}>← Назад</button>
                          <h3 style={{ marginRight: 'auto', fontSize: '1rem' }}>{selectedVisualization.name}</h3>
                          
                          <button 
                            className={`btn ${isCodeCollapsed ? 'btn-primary' : 'btn-outline'}`}
                            onClick={() => setIsCodeCollapsed(!isCodeCollapsed)}
                          >
                            {isCodeCollapsed ? 'Показать код' : 'Свернуть код'}
                          </button>
                          
                          <button 
                            className={`btn ${isDesktopView ? 'btn-primary' : 'btn-outline'}`}
                            onClick={() => setIsDesktopView(!isDesktopView)}
                          >
                            {isDesktopView ? '100% ширина' : 'Десктоп (1200px)'}
                          </button>

                          <button 
                            className="btn btn-outline"
                            onClick={() => {
                              const blob = new Blob([selectedVisualization.content], { type: 'text/html' });
                              const url = URL.createObjectURL(blob);
                              window.open(url, '_blank');
                            }}
                          >
                            Открыть в новом окне
                          </button>
                          
                          {canManageVisualizations && (
                            <button className="btn btn-primary" onClick={() => handleUpdateVisualization(selectedVisualization.id, selectedVisualization.content)}>
                              Сохранить
                            </button>
                          )}
                        </div>
                        <div className="visualization-editor-body">
                          {canManageVisualizations && !isCodeCollapsed ? (
                            <div className="visualization-code-panel" style={{ flex: 1 }}>
                              <div className="panel-header">HTML / CSS / JS</div>
                              <textarea 
                                className="visualization-textarea"
                                value={selectedVisualization.content}
                                onChange={(e) => setSelectedVisualization({...selectedVisualization, content: e.target.value})}
                                spellCheck="false"
                              />
                            </div>
                          ) : null}
                          <div className="visualization-preview-panel" style={{ flex: isCodeCollapsed ? 1 : 1.5 }}>
                            <div className="panel-header">Превью (Sandbox)</div>
                            <div style={{ flex: 1, overflow: 'auto', background: '#fff', position: 'relative' }}>
                              <iframe 
                                className="visualization-iframe"
                                title={selectedVisualization.name}
                                srcDoc={selectedVisualization.content}
                                sandbox="allow-scripts"
                                style={{ 
                                  width: isDesktopView ? '1200px' : '100%', 
                                  height: '100%', 
                                  minHeight: '100%', 
                                  border: 'none',
                                  display: 'block'
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
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
                          {visibleOrganizationUsers.filter(user => !activeProjectMembers.some(member => member.user_id === user.id)).map(user => (
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
                      {visibleProjectMembers.length > 0 ? visibleProjectMembers.map(member => {
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
                                <div className="project-member-photo-fallback">{getUserInitials(user?.name || user?.email)}</div>
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
                                    <strong>{formatPhone(user?.phone) || 'Не указан'}</strong>
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
                              {canConfigureNotificationChannels && renderNotificationChannelControls(user)}
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

        <AnimatePresence>
        {(selectedTask && activeView === 'map') && (
           <m.div
             key={selectedTask.id}
             initial={shouldReduceMotion ? false : { opacity: 0, x: 18, scale: 0.98 }}
             animate={{ opacity: 1, x: 0, scale: 1 }}
             exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, x: 14, scale: 0.98 }}
             transition={{ type: 'spring', stiffness: 460, damping: 36 }}
             style={{ position: 'absolute', left: panelPos.x, top: panelPos.y, zIndex: 100, display: 'flex' }}
           >
              <TaskSidebar 
                taskId={selectedTask.id} 
                onClose={() => setSelectedTaskId(null)} 
                currentUser={currentUser} 
                users={visibleOrganizationUsers} 
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
           </m.div>
        )}
        </AnimatePresence>

        <AnimatePresence>
          {hoveredTooltip && (
            <m.div
              initial={{ opacity: 0, scale: 0.95, y: hoveredTooltip.rect.top < 150 ? 5 : -5 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: hoveredTooltip.rect.top < 150 ? 5 : -5 }}
              transition={{ duration: 0.12 }}
              style={{
                position: 'fixed',
                top: hoveredTooltip.rect.top < 150 ? hoveredTooltip.rect.bottom + 8 : hoveredTooltip.rect.top - 8,
                left: hoveredTooltip.rect.left + hoveredTooltip.rect.width / 2,
                transform: hoveredTooltip.rect.top < 150 ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
                zIndex: 99999,
                pointerEvents: 'none',
                padding: '0.65rem 0.9rem',
                borderRadius: '8px',
                boxShadow: '0 10px 25px rgba(0, 0, 0, 0.4)',
                border: '1px solid var(--panel-border)',
                minWidth: '150px',
                maxWidth: '280px',
                fontSize: '0.78rem',
                color: 'var(--text-primary)',
                backgroundColor: 'rgba(20, 20, 20, 0.92)',
                backdropFilter: 'blur(10px)',
                lineHeight: '1.4'
              }}
            >
              {hoveredTooltip.type === 'assignee' && (
                <div>
                  <div style={{ fontWeight: '600', color: 'var(--accent-color, #3b82f6)' }}>{hoveredTooltip.data.name}</div>
                  {hoveredTooltip.data.role && <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>{hoveredTooltip.data.role}</div>}
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>{hoveredTooltip.data.email}</div>
                </div>
              )}
              {hoveredTooltip.type === 'subtasks' && (
                <div>
                  <div style={{ fontWeight: '600', marginBottom: '0.35rem', borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.15rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Подзадачи:</span>
                    {!hoveredTooltip.isLoading && (
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {hoveredTooltip.data.filter(t => t.is_completed).length}/{hoveredTooltip.data.length}
                      </span>
                    )}
                  </div>
                  {hoveredTooltip.isLoading ? (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>Загрузка...</div>
                  ) : hoveredTooltip.data.length === 0 ? (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>Нет подзадач</div>
                  ) : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      {hoveredTooltip.data.map((item, idx) => (
                        <li key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', textDecoration: item.is_completed ? 'line-through' : 'none', color: item.is_completed ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                          <span style={{ color: item.is_completed ? '#10b981' : 'var(--text-secondary)', fontWeight: 'bold' }}>
                            {item.is_completed ? '✓' : '○'}
                          </span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '220px' }}>{item.text || item.name}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {hoveredTooltip.type === 'comments' && (
                <div>
                  <div style={{ fontWeight: '600', marginBottom: '0.35rem', borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.15rem' }}>Последние комментарии:</div>
                  {hoveredTooltip.isLoading ? (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>Загрузка...</div>
                  ) : hoveredTooltip.data.length === 0 ? (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>Нет комментариев</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {hoveredTooltip.data.slice(-3).reverse().map((item, idx) => {
                        const author = item.author || users.find(u => u.id === item.author_id);
                        return (
                          <div key={idx} style={{ fontSize: '0.7rem', borderBottom: idx < Math.min(3, hoveredTooltip.data.length) - 1 ? '1px dashed rgba(255,255,255,0.05)' : 'none', paddingBottom: '0.25rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', fontWeight: '500', marginBottom: '0.05rem' }}>
                              <span style={{ color: 'var(--accent-color, #3b82f6)' }}>{author?.name || author?.email || 'Система'}</span>
                              <span style={{ color: 'var(--text-secondary)', fontSize: '0.6rem' }}>{formatDate(item.created_at)}</span>
                            </div>
                            <div style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '240px' }}>{item.text}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {hoveredTooltip.type === 'attachments' && (
                <div>
                  <div style={{ fontWeight: '600', marginBottom: '0.35rem', borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.15rem' }}>Вложения:</div>
                  {hoveredTooltip.data.length === 0 ? (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>Вложений нет</div>
                  ) : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      {hoveredTooltip.data.map((file, idx) => (
                        <li key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.7rem' }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, color: 'var(--text-secondary)' }}>
                            <path d="M21.44 11.05 12 20.49a6 6 0 0 1-8.49-8.49l9.44-9.44a4 4 0 0 1 5.66 5.66l-9.44 9.44a2 2 0 0 1-2.83-2.83l8.49-8.49" />
                          </svg>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px', color: 'var(--text-primary)' }}>
                            {file.file_name || file.name}
                          </span>
                          {file.file_size && <span style={{ color: 'var(--text-secondary)', fontSize: '0.6rem' }}>({formatFileSize(file.file_size)})</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {hoveredTooltip.type === 'date' && (
                <div>
                  <div style={{ fontWeight: '500', color: 'var(--text-secondary)', fontSize: '0.7rem' }}>Срок исполнения:</div>
                  <div style={{ marginTop: '0.15rem', fontWeight: '600', color: 'var(--accent-color, #3b82f6)' }}>{formatDate(hoveredTooltip.data)}</div>
                </div>
              )}
              {hoveredTooltip.type === 'status' && (
                <div>
                  <div style={{ fontWeight: '500', color: 'var(--text-secondary)', fontSize: '0.7rem' }}>Текущий статус:</div>
                  <div style={{ marginTop: '0.15rem', fontWeight: '600' }} className={`status-badge-text ${hoveredTooltip.data}`}>{statusLabels[hoveredTooltip.data]}</div>
                </div>
              )}
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </div>
    </LazyMotion>
  );
}

export default App;
