'use client';
// src/app/community/events/page.tsx
import { useState, useEffect } from 'react';
import { eventsAPI } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const TYPE_COLORS: Record<string, string> = {
  GALA:        'type-event',
  NETWORKING:  'type-network',
  WEBINAR:     'type-insight',
  WORKSHOP:    'type-hiring',
  ROUNDTABLE:  'type-deal',
};

function CreateEventModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    title: '', description: '', type: 'NETWORKING',
    startDate: '', endDate: '', location: '', isOnline: false, maxAttendees: '',
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await eventsAPI.create({ ...form, maxAttendees: form.maxAttendees || undefined });
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create event');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="comm-modal-overlay" onClick={onClose}>
      <div className="comm-modal" style={{ width: 540 }} onClick={e => e.stopPropagation()}>
        <div className="comm-modal-title">Create Event</div>
        <form onSubmit={submit}>
          <div className="comm-form-group">
            <label className="comm-form-label">Title *</label>
            <input className="comm-form-input" value={form.title} onChange={set('title')} required />
          </div>
          <div className="comm-form-group">
            <label className="comm-form-label">Description</label>
            <textarea className="comm-form-textarea" value={form.description} onChange={set('description')} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="comm-form-group">
              <label className="comm-form-label">Type</label>
              <select className="comm-form-select" value={form.type} onChange={set('type')}>
                <option value="NETWORKING">Community</option>
                <option value="GALA">Gala</option>
                <option value="WEBINAR">Webinar</option>
                <option value="WORKSHOP">Workshop</option>
                <option value="ROUNDTABLE">Roundtable</option>
              </select>
            </div>
            <div className="comm-form-group">
              <label className="comm-form-label">Max Attendees</label>
              <input className="comm-form-input" type="number" placeholder="Leave blank for unlimited"
                value={form.maxAttendees} onChange={set('maxAttendees')} />
            </div>
            <div className="comm-form-group">
              <label className="comm-form-label">Start Date *</label>
              <input className="comm-form-input" type="datetime-local" value={form.startDate} onChange={set('startDate')} required />
            </div>
            <div className="comm-form-group">
              <label className="comm-form-label">End Date *</label>
              <input className="comm-form-input" type="datetime-local" value={form.endDate} onChange={set('endDate')} required />
            </div>
          </div>
          <div className="comm-form-group">
            <label className="comm-form-label">Location / URL</label>
            <input className="comm-form-input" placeholder="e.g. Casino de Monte-Carlo, Monaco"
              value={form.location} onChange={set('location')} />
          </div>
          {error && <p className="form-error" style={{ marginBottom: 10 }}>{error}</p>}
          <div className="comm-modal-actions">
            <button type="button" className="comm-btn comm-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="comm-btn comm-btn-primary" disabled={loading}>
              {loading ? 'Creating…' : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function EventsPage() {
  const { user }   = useAuth();
  const [events,   setEvents]   = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [upcoming, setUpcoming] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const loadEvents = () => {
    setLoading(true);
    eventsAPI.getAll({ upcoming: upcoming ? 'true' : 'false' })
      .then(r => setEvents(r.data.events || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadEvents(); }, [upcoming]);

  const handleRegister = async (eventId: string, registered: boolean) => {
    if (registered) {
      await eventsAPI.cancelRegistration(eventId);
    } else {
      await eventsAPI.register(eventId);
    }
    loadEvents();
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 28px 80px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600, marginBottom: 4 }}>
            Events &amp; Galas
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Exclusive networking events, galas, and masterclasses for circle members.
          </p>
        </div>
        {user?.role === 'ADMIN' && (
          <button className="comm-btn comm-btn-primary" onClick={() => setCreateOpen(true)}>
            + Create Event
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[true, false].map(u => (
          <button key={String(u)}
            className={`comm-btn ${upcoming === u ? 'comm-btn-primary' : 'comm-btn-secondary'}`}
            style={{ padding: '8px 16px', fontSize: 12 }}
            onClick={() => setUpcoming(u)}
          >
            {u ? 'Upcoming' : 'Past Events'}
          </button>
        ))}
      </div>

      {/* Events grid */}
      {loading ? (
        <div className="comm-empty"><div className="spinner" style={{ width: 32, height: 32, borderWidth: 2, margin: 0 }} /></div>
      ) : events.length === 0 ? (
        <div className="comm-empty">
          <div className="comm-empty-icon">🎭</div>
          <div className="comm-empty-text">No {upcoming ? 'upcoming' : 'past'} events</div>
          {user?.role === 'ADMIN' && (
            <button className="comm-btn comm-btn-primary" onClick={() => setCreateOpen(true)}>
              Create First Event
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {events.map(ev => {
            const start = new Date(ev.startDate);
            const end   = new Date(ev.endDate);
            return (
              <div key={ev.id} className="comm-project-card">
                {/* Date badge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ background: 'rgba(58,111,255,0.12)', border: '1px solid rgba(58,111,255,0.2)', borderRadius: 8, padding: '8px 10px', textAlign: 'center', minWidth: 44 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#3a6fff', lineHeight: 1 }}>{start.getDate()}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {start.toLocaleString('en', { month: 'short' }).toUpperCase()}
                      </div>
                    </div>
                    <div>
                      <div className="comm-project-title">{ev.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {start.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}
                        {' – '}
                        {end.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                  <span className={`comm-post-type ${TYPE_COLORS[ev.type] || 'type-event'}`}>{ev.type}</span>
                </div>

                {ev.description && (
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12,
                    overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {ev.description}
                  </p>
                )}

                <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)', marginBottom: 14, flexWrap: 'wrap' }}>
                  {ev.location && <span>📍 {ev.location}</span>}
                  {ev.isOnline  && <span>🌐 Online</span>}
                  <span>👥 {ev.attendeeCount}{ev.maxAttendees ? `/${ev.maxAttendees}` : ''} attending</span>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  {upcoming && (
                    <button
                      className={`comm-deal-btn ${ev.registeredByMe ? '' : 'gold-btn'}`}
                      style={{ flex: 1 }}
                      onClick={() => handleRegister(ev.id, ev.registeredByMe)}
                    >
                      {ev.registeredByMe ? '✓ Registered (Cancel)' : 'RSVP'}
                    </button>
                  )}
                  {user?.role === 'ADMIN' && (
                    <button className="comm-deal-btn"
                      style={{ flex: 0, padding: '7px 14px', color: 'var(--red)', borderColor: 'rgba(224,82,82,0.3)', background: 'rgba(224,82,82,0.08)' }}
                      onClick={async () => {
                        if (!confirm('Delete this event?')) return;
                        await eventsAPI.remove(ev.id);
                        loadEvents();
                      }}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {createOpen && <CreateEventModal onClose={() => setCreateOpen(false)} onCreated={loadEvents} />}
    </div>
  );
}
