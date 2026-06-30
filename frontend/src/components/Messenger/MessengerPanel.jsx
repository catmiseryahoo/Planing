import { useState, useEffect, useRef, useCallback } from 'react';
import { m } from 'motion/react';

const MESSENGER_SIDEBAR_WIDTH = 260;
const MESSENGER_HEADER_HEIGHT = 76;
const MESSENGER_MIN_CHAT_WIDTH = 320;
const MESSENGER_MIN_CHAT_HEIGHT = 340;
const FLOATING_WINDOW_MARGIN = 8;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const getUserInitials = (name) => {
  if (typeof name !== 'string') return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) || '?';
};
const isImageFile = (file) => /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(String(file?.file_name || file?.file_url || file?.name || ''));
const formatFileSize = (size) => {
  if (!size) return '';
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

export default function MessengerPanel({
  currentUser,
  users,
  activeProjectId,
  activeProject,
  activeOrganizationId,
  siteMessages,
  setSiteMessages,
  isMessengerOpen,
  setIsMessengerOpen,
  shouldReduceMotion,
  supabase,
  canManageOrganization,
  currentOrganizationRole,
  activeProjectMembers,
  visibleOrganizationUsers
}) {
  const safeUsers = users || [];
  const safeSiteMessages = siteMessages || [];
  const safeVisibleUsers = visibleOrganizationUsers || [];
  const safeProjectMembers = activeProjectMembers || [];

  const [messengerText, setMessengerText] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [selectedMessengerUserIds, setSelectedMessengerUserIds] = useState([]);
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

  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [tempAttachment, setTempAttachment] = useState(null);

  // Refs replaced with direct DOM access to bypass Rolldown minification bug

  const getUser = useCallback((id) => safeUsers.find(u => u.id === id), [safeUsers]);

  const getConstrainedMessengerLayout = useCallback((position, size) => {
    if (window.innerWidth <= 900) {
      return { position, size };
    }

    const maxChatWidth = Math.max(
      MESSENGER_MIN_CHAT_WIDTH,
      window.innerWidth - MESSENGER_SIDEBAR_WIDTH - FLOATING_WINDOW_MARGIN * 3
    );
    const nextWidth = Math.min(size.width || MESSENGER_MIN_CHAT_WIDTH, maxChatWidth);
    const totalWidth = MESSENGER_SIDEBAR_WIDTH + nextWidth;
    const maxX = Math.max(FLOATING_WINDOW_MARGIN, window.innerWidth - totalWidth - FLOATING_WINDOW_MARGIN);
    const nextX = clamp(position.x || 0, FLOATING_WINDOW_MARGIN, maxX);

    const maxChatHeight = Math.max(
      MESSENGER_MIN_CHAT_HEIGHT,
      window.innerHeight - MESSENGER_HEADER_HEIGHT - FLOATING_WINDOW_MARGIN * 2
    );
    const nextHeight = Math.min(size.height || MESSENGER_MIN_CHAT_HEIGHT, maxChatHeight);
    const maxY = Math.max(FLOATING_WINDOW_MARGIN, window.innerHeight - MESSENGER_HEADER_HEIGHT - nextHeight - FLOATING_WINDOW_MARGIN);
    const nextY = clamp(position.y || 0, FLOATING_WINDOW_MARGIN, maxY);

    return {
      position: { x: nextX, y: nextY },
      size: { width: nextWidth, height: nextHeight }
    };
  }, []);

  useEffect(() => {
    if (isMessengerOpen) {
      document.getElementById('messenger-end-element')?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [safeSiteMessages, isMessengerOpen]);

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
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, [getConstrainedMessengerLayout, messengerChatSize]);

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
    const textarea = document.getElementById('messenger-textarea-element');
    if (!textarea) return;
    textarea.style.height = '0px';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [messengerText]);

  if (!currentUser) return null;

  const activeProjectMemberIds = new Set(safeProjectMembers.map(member => member.user_id));
  const canUseProjectChat = Boolean(activeProjectId) && (
    activeProjectMemberIds.has(currentUser.id)
    || canManageOrganization
    || currentOrganizationRole === 'project_manager'
  );
  
  const messengerUsers = safeVisibleUsers.filter(user => user.id !== currentUser.id);
  const selectedMessengerUsers = selectedMessengerUserIds
    .map(id => getUser(id))
    .filter(Boolean);
  const conversationParticipantIds = [currentUser.id, ...selectedMessengerUserIds].sort();
  const conversationTitle = selectedMessengerUsers.length
    ? selectedMessengerUsers.map(user => user.name || user.email).join(', ')
    : `Общий чат${activeProject ? `: ${activeProject.name}` : ''}`;
    
  const getMessageParticipants = (message) => {
    const recs = Array.isArray(message.recipient_ids) ? message.recipient_ids : [];
    return Array.from(new Set([message.author_id, ...recs])).filter(Boolean).sort();
  };
    
  const isSameParticipantSet = (left, right) => left.length === right.length && left.every((item, index) => item === right[index]);
  
  const conversationMessages = safeSiteMessages.filter(message => {
    const recs = Array.isArray(message.recipient_ids) ? message.recipient_ids : [];
    if (selectedMessengerUserIds.length === 0) {
      return recs.length === 0 && message.project_id === activeProjectId;
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

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingFile(true);
    try {
      const safeName = file.name.replace(/[^\w.\-а-яА-ЯёЁ ]/g, '_');
      const cryptoFn = window.crypto && window.crypto.randomUUID ? () => window.crypto.randomUUID() : () => Date.now().toString(36) + Math.random().toString(36).substr(2);
      const filePath = `messenger/${currentUser.id}/${cryptoFn()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from('task-files')
        .upload(filePath, file, { upsert: false });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data: publicUrlData } = supabase.storage
        .from('task-files')
        .getPublicUrl(filePath);

      setTempAttachment({
        url: publicUrlData.publicUrl,
        name: file.name,
        size: file.size
      });
    } catch (err) {
      alert('Ошибка при загрузке файла: ' + err.message);
    } finally {
      setIsUploadingFile(false);
      const fileInput = document.getElementById('messenger-file-input-element');
      if (fileInput) fileInput.value = '';
    }
  };

  const handleSendSiteMessage = async (e) => {
    e.preventDefault();
    const body = messengerText.trim();
    if ((!body && !tempAttachment) || !currentUser?.id || isSendingMessage) return;
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
      body: body || tempAttachment.name,
      file_url: tempAttachment ? tempAttachment.url : null,
      file_name: tempAttachment ? tempAttachment.name : null,
      file_size: tempAttachment ? tempAttachment.size : null,
      created_at: new Date().toISOString(),
      isLocal: true
    };
    setSiteMessages([...safeSiteMessages, optimisticMessage]);
    setMessengerText('');
    const currentTempAttachment = tempAttachment;
    setTempAttachment(null);

    const { data, error } = await supabase
      .from('site_messages')
      .insert([{
        author_id: currentUser.id,
        recipient_ids: selectedMessengerUserIds,
        project_id: projectId,
        organization_id: activeOrganizationId,
        body: body || currentTempAttachment.name,
        file_url: currentTempAttachment ? currentTempAttachment.url : null,
        file_name: currentTempAttachment ? currentTempAttachment.name : null,
        file_size: currentTempAttachment ? currentTempAttachment.size : null
      }])
      .select()
      .single();

    setIsSendingMessage(false);

    if (error) {
      setSiteMessages(safeSiteMessages);
      setMessengerText(body);
      setTempAttachment(currentTempAttachment);
      alert('Ошибка отправки сообщения: ' + error.message);
      return;
    }

    setSiteMessages(currentMessages => (currentMessages || []).map(message => message.id === optimisticMessage.id ? data : message));
    try {
      const { data: notificationData, error: notificationError } = await supabase.functions.invoke('dispatch-message-notifications', {
        body: { messageId: data.id }
      });
      if (notificationError) {
        console.warn('Ошибка отправки внешних уведомлений:', notificationError.message);
      } else if (notificationData?.results) {
        console.info('Внешние уведомления:', notificationData.results);
      }
    } catch (e) {
      console.warn('Ошибка вызова функции уведомлений:', e);
    }
  };

  return (
    <m.div
      className="messenger-layer"
      initial={shouldReduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <div className="messenger-backdrop" onClick={() => setIsMessengerOpen(false)} />
      <m.div
        className="messenger-popover glass-panel"
        style={{ left: messengerWindow.x, top: messengerWindow.y }}
        initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.96, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.98, y: -6 }}
        transition={{ type: 'spring', stiffness: 520, damping: 38, mass: 0.7 }}
      >
        <div className="messenger-header" onMouseDown={handleMessengerDragStart}>
          <div>
            <h3>Мессенджер</h3>
            <span>{conversationTitle}</span>
          </div>
          <button className="btn btn-icon close-panel-btn" type="button" title="Закрыть" onClick={() => setIsMessengerOpen(false)}>×</button>
        </div>
        <div className="messenger-layout" style={{ height: messengerChatSize.height }}>
          <aside className="messenger-sidebar">
            <div className="messenger-sidebar-title">Диалоги</div>
            <button
              type="button"
              className={`messenger-dialog-item ${selectedMessengerUserIds.length === 0 ? 'active' : ''}`}
              disabled={!canUseProjectChat}
              onClick={() => setSelectedMessengerUserIds([])}
              title={canUseProjectChat ? 'Общий чат активного проекта' : 'Вы не участник активного проекта'}
            >
              <div className="messenger-dialog-avatar project-chat">#</div>
              <div className="messenger-dialog-info">
                <strong>Общий чат проекта</strong>
                <span>{activeProject?.name || 'Проект не выбран'}</span>
              </div>
            </button>
            <div className="messenger-sidebar-title muted">Сотрудники</div>
            <div className="messenger-user-list">
              {messengerUsers.map(user => (
                <button
                  key={user.id}
                  type="button"
                  className={`messenger-dialog-item ${selectedMessengerUserIds.includes(user.id) ? 'active' : ''}`}
                  onClick={(e) => handleMessengerRecipientSelect(user.id, e.shiftKey)}
                  title={user.email}
                >
                  <div className="messenger-dialog-avatar" style={{backgroundColor: user.avatar_color || '#3b82f6', backgroundImage: user.avatar_url ? `url(${user.avatar_url})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center'}}>
                    {!user.avatar_url && getUserInitials(user.name || user.email)}
                  </div>
                  <div className="messenger-dialog-info">
                    <strong>{user.name || user.email}</strong>
                    <span>{selectedMessengerUserIds.includes(user.id) ? 'Выбран' : user.email}</span>
                  </div>
                </button>
              ))}
            </div>
          </aside>
          <section className="messenger-chat" style={{ width: messengerChatSize.width }}>
            <div className="messenger-chat-title">
              <strong>{conversationTitle}</strong>
              <span>{selectedMessengerUsers.length ? `${selectedMessengerUsers.length + 1} участников` : 'Проектный чат'}</span>
            </div>
            <div className="messenger-messages">
              {conversationMessages.length > 0 ? conversationMessages.map(message => {
                const author = getUser(message.author_id);
                const isMine = message.author_id === currentUser.id;
                return (
                  <div key={message.id} className={`messenger-message ${isMine ? 'mine' : ''}`}>
                    {!isMine && (
                      <div className="avatar sm messenger-avatar" style={{backgroundColor: author?.avatar_color || '#3b82f6', backgroundImage: author?.avatar_url ? `url(${author.avatar_url})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center'}}>
                        {!author?.avatar_url && getUserInitials(author?.name || author?.email)}
                      </div>
                    )}
                    <div className="messenger-bubble">
                      <div className="messenger-meta">
                        <strong>{isMine ? 'Вы' : author?.name || author?.email || 'Пользователь'}</strong>
                        <span>{message.created_at ? new Date(message.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                      </div>
                      <div className="messenger-text">{message.body}</div>
                      {message.file_url && (
                        <div className="messenger-attachment" style={{ marginTop: '6px' }}>
                          {isImageFile(message) ? (
                            <a href={message.file_url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', borderRadius: '4px', overflow: 'hidden', maxWidth: '100%', maxHeight: '200px' }}>
                              <img src={message.file_url} alt={message.file_name} style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain', maxHeight: '200px' }} />
                            </a>
                          ) : (
                            <a
                              href={message.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="messenger-file-card"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '6px 10px',
                                background: 'rgba(255, 255, 255, 0.08)',
                                borderRadius: '6px',
                                textDecoration: 'none',
                                color: 'inherit',
                                fontSize: '0.85rem',
                                border: '1px solid rgba(255, 255, 255, 0.1)'
                              }}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                              </svg>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontWeight: '500' }}>{message.file_name}</div>
                                {message.file_size && <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>{formatFileSize(message.file_size)}</div>}
                              </div>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, opacity: 0.8 }}>
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                              </svg>
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }) : (
                <div className="messenger-empty">
                  {selectedMessengerUserIds.length === 0 && !canUseProjectChat
                    ? 'Общий чат доступен только участникам активного проекта.'
                    : 'Пока нет сообщений в этой беседе.'}
                </div>
              )}
              <div id="messenger-end-element" />
            </div>
            {tempAttachment && (
              <div
                className="messenger-temp-attachment"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 12px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  borderTop: '1px solid var(--panel-border)',
                  fontSize: '0.85rem',
                  color: 'var(--text-primary)'
                }}
              >
                <span style={{ opacity: 0.7 }}>Прикреплено:</span>
                <span style={{ fontWeight: '500', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', flex: 1 }}>{tempAttachment.name}</span>
                <button
                  type="button"
                  onClick={() => setTempAttachment(null)}
                  className="btn btn-icon"
                  style={{ padding: '2px', height: 'auto', width: 'auto', color: 'var(--text-secondary)' }}
                  title="Удалить прикрепленный файл"
                >
                  ✕
                </button>
              </div>
            )}
            <form className="messenger-form" onSubmit={handleSendSiteMessage}>
              <input
                id="messenger-file-input-element"
                type="file"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="btn btn-icon messenger-attach-btn"
                title="Прикрепить файл или изображение"
                style={{ padding: '8px', opacity: isUploadingFile ? 0.6 : 0.8, color: 'var(--text-primary)' }}
                onClick={() => document.getElementById('messenger-file-input-element')?.click()}
                disabled={isUploadingFile}
              >
                {isUploadingFile ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" style={{ opacity: 0.25 }}></circle>
                    <path d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" fill="currentColor"></path>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                  </svg>
                )}
              </button>
              <textarea
                id="messenger-textarea-element"
                value={messengerText}
                onChange={(e) => setMessengerText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                     e.preventDefault();
                     handleSendSiteMessage(e);
                  }
                }}
                placeholder="Написать сообщение..."
                rows={1}
              />
              <button className="messenger-send-btn" type="submit" title="Отправить" disabled={(!messengerText.trim() && !tempAttachment) || isSendingMessage || (selectedMessengerUserIds.length === 0 && !canUseProjectChat)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M22 2 11 13"></path>
                  <path d="m22 2-7 20-4-9-9-4Z"></path>
                </svg>
              </button>
            </form>
          </section>
        </div>
        <button className="messenger-resize-handle" type="button" title="Изменить размер" onMouseDown={handleMessengerResizeStart}>
          <span></span>
        </button>
      </m.div>
    </m.div>
  );
}
