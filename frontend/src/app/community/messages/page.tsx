'use client';
// src/app/community/messages/page.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { messagesAPI, communityAPI } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const API_URL = process.env.NODE_ENV === 'production'
  ? (process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '')
  : '';

function avatarUrl(photo?: string | null) {
  if (!photo) return null;
  return photo.startsWith('http') ? photo : `${API_URL}${photo}`;
}

function initial(name?: string) {
  return name?.charAt(0).toUpperCase() || '?';
}

// ── New Conversation Search ────────────────────
function NewConvModal({ onClose, onSelect }: { onClose: () => void; onSelect: (user: any) => void }) {
  const [search,  setSearch]  = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    const t = setTimeout(() => {
      setLoading(true);
      communityAPI.getMembers({ search, limit: '10' })
        .then(r => setResults(r.data.members || []))
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div className="comm-modal-overlay" onClick={onClose}>
      <div className="comm-modal" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
        <div className="comm-modal-title">New Message</div>
        <input className="comm-form-input" placeholder="Search members…"
          value={search} onChange={e => setSearch(e.target.value)} autoFocus />
        <div style={{ marginTop: 12, maxHeight: 300, overflowY: 'auto' }}>
          {loading && <div style={{ padding: 12, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>Searching…</div>}
          {results.map(m => (
            <div key={m.id}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
              onClick={() => { onSelect(m); onClose(); }}
            >
              <div className="comm-chat-item-avatar">
                {avatarUrl(m.profilePhoto) ? <img src={avatarUrl(m.profilePhoto)!} alt={m.name} /> : initial(m.name)}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{m.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.profile?.company || 'Member'}</div>
              </div>
            </div>
          ))}
          {!loading && search && results.length === 0 && (
            <div style={{ padding: 16, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>No members found</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────
export default function MessagesPage() {
  const { user }    = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [conversations, setConversations] = useState<any[]>([]);
  const [activePartner, setActivePartner] = useState<any>(null);
  const [messages,      setMessages]      = useState<any[]>([]);
  const [newMsg,        setNewMsg]        = useState('');
  const [sending,       setSending]       = useState(false);
  const [newConvOpen,   setNewConvOpen]   = useState(false);
  const [loadingMsgs,   setLoadingMsgs]   = useState(false);

  const loadConversations = useCallback(() => {
    messagesAPI.getConversations().then(r => setConversations(r.data.conversations || [])).catch(() => {});
  }, []);

  useEffect(() => {
    loadConversations();
    const id = setInterval(loadConversations, 10_000);
    return () => clearInterval(id);
  }, [loadConversations]);

  const openConversation = async (partner: any) => {
    setActivePartner(partner);
    setLoadingMsgs(true);
    try {
      const r = await messagesAPI.getMessages(partner.id);
      setMessages(r.data.messages || []);
      // Mark conversation unread count = 0 locally
      setConversations(prev => prev.map(c =>
        c.partner.id === partner.id ? { ...c, unreadCount: 0 } : c
      ));
    } finally {
      setLoadingMsgs(false);
    }
  };

  // Poll messages when conversation is open
  useEffect(() => {
    if (!activePartner) return;
    const id = setInterval(async () => {
      const r = await messagesAPI.getMessages(activePartner.id);
      setMessages(r.data.messages || []);
    }, 5_000);
    return () => clearInterval(id);
  }, [activePartner]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    if (!newMsg.trim() || !activePartner || sending) return;
    const content = newMsg.trim();
    setNewMsg('');
    setSending(true);
    try {
      await messagesAPI.sendMessage(activePartner.id, content);
      const r = await messagesAPI.getMessages(activePartner.id);
      setMessages(r.data.messages || []);
      loadConversations();
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const handleNewConvSelect = (member: any) => {
    // Check if conversation already exists
    const existing = conversations.find(c => c.partner.id === member.id);
    if (existing) {
      openConversation(member);
    } else {
      // Add temporary conversation
      setConversations(prev => [{ partner: member, lastMessage: null, unreadCount: 0 }, ...prev]);
      openConversation(member);
    }
  };

  const formatMsgTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 28px' }}>
      <div className="comm-chat-layout" style={{ height: 'calc(100vh - 120px)' }}>

        {/* ── Conversation List ──────────────── */}
        <div className="comm-chat-sidebar">
          <div className="comm-chat-sidebar-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Messages</span>
            <button className="comm-btn comm-btn-primary" style={{ padding: '5px 12px', fontSize: 11 }}
              onClick={() => setNewConvOpen(true)}>
              + New
            </button>
          </div>
          <div className="comm-chat-list">
            {conversations.length === 0 ? (
              <div className="comm-empty" style={{ padding: '40px 20px' }}>
                <div className="comm-empty-icon">💬</div>
                <div className="comm-empty-text" style={{ fontSize: 12 }}>No conversations yet</div>
              </div>
            ) : (
              conversations.map(({ partner, lastMessage, unreadCount }) => (
                <div key={partner.id}
                  className={`comm-chat-item${activePartner?.id === partner.id ? ' active' : ''}`}
                  onClick={() => openConversation(partner)}
                >
                  <div className="comm-chat-item-avatar">
                    {avatarUrl(partner.profilePhoto)
                      ? <img src={avatarUrl(partner.profilePhoto)!} alt={partner.name} />
                      : initial(partner.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="comm-chat-item-name">{partner.name}</div>
                    <div className="comm-chat-item-preview">
                      {lastMessage?.content || 'Start a conversation…'}
                    </div>
                  </div>
                  {unreadCount > 0 && (
                    <span className="comm-chat-unread">{unreadCount}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Chat Area ─────────────────────── */}
        <div className="comm-chat-area">
          {!activePartner ? (
            <div className="comm-empty" style={{ flex: 1 }}>
              <div className="comm-empty-icon">✉️</div>
              <div className="comm-empty-text">Select a conversation</div>
              <div className="comm-empty-sub">or start a new one</div>
              <button className="comm-btn comm-btn-primary" onClick={() => setNewConvOpen(true)}>New Message</button>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="comm-chat-header">
                <div className="comm-chat-item-avatar" style={{ width: 36, height: 36 }}>
                  {avatarUrl(activePartner.profilePhoto)
                    ? <img src={avatarUrl(activePartner.profilePhoto)!} alt={activePartner.name} />
                    : initial(activePartner.name)}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{activePartner.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {activePartner.profile?.company || 'Member'}
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="comm-chat-messages">
                {loadingMsgs ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                    <div className="spinner" style={{ width: 28, height: 28, borderWidth: 2, margin: 0 }} />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="comm-empty">
                    <div className="comm-empty-icon">👋</div>
                    <div className="comm-empty-text">Say hello to {activePartner.name}</div>
                  </div>
                ) : (
                  messages.map(msg => {
                    const mine = msg.senderId === user?.id;
                    return (
                      <div key={msg.id} className={`comm-msg${mine ? ' mine' : ''}`}>
                        {!mine && (
                          <div className="comm-chat-item-avatar" style={{ width: 28, height: 28, fontSize: 10, flexShrink: 0 }}>
                            {avatarUrl(activePartner.profilePhoto)
                              ? <img src={avatarUrl(activePartner.profilePhoto)!} alt={activePartner.name} />
                              : initial(activePartner.name)}
                          </div>
                        )}
                        <div>
                          <div className="comm-msg-bubble">{msg.content}</div>
                          <div className="comm-msg-time">{formatMsgTime(msg.createdAt)}</div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="comm-chat-input-row">
                <input
                  className="comm-chat-input"
                  placeholder={`Message ${activePartner.name}…`}
                  value={newMsg}
                  onChange={e => setNewMsg(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <button className="comm-chat-send" onClick={send} disabled={!newMsg.trim() || sending}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {newConvOpen && <NewConvModal onClose={() => setNewConvOpen(false)} onSelect={handleNewConvSelect} />}
    </div>
  );
}
