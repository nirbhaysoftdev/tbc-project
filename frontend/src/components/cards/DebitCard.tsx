'use client';
// src/components/cards/DebitCard.tsx
import { useState, useRef } from 'react';

interface Props {
  name:    string;
  number?: string;
}

export default function DebitCard({ name, number = '**** **** **** 3456' }: Props) {
  const [flipped, setFlipped]   = useState(false);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const cardRef                 = useRef<HTMLDivElement>(null);
  const touchStartX             = useRef(0);
  const touchStartY             = useRef(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (flipped) return;
    const card = cardRef.current;
    if (!card) return;
    const rect    = card.getBoundingClientRect();
    const rotateX = ((e.clientY - rect.top  - rect.height / 2) / (rect.height / 2)) * -12;
    const rotateY = ((e.clientX - rect.left - rect.width  / 2) / (rect.width  / 2)) *  12;
    setRotation({ x: rotateX, y: rotateY });
  };

  const handleMouseLeave = () => setRotation({ x: 0, y: 0 });

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    if (Math.abs(deltaX) > 50 && deltaY < 40) setFlipped(f => !f);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

      {/* Perspective wrapper */}
      <div
        style={{ perspective: '1200px', width: 300, height: 188, cursor: 'pointer' }}
        onClick={() => setFlipped(f => !f)}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          ref={cardRef}
          style={{
            width: '100%', height: '100%',
            position: 'relative',
            transformStyle: 'preserve-3d',
            WebkitTransformStyle: 'preserve-3d',
            transition: flipped
              ? 'transform 0.7s cubic-bezier(0.4,0.2,0.2,1)'
              : 'transform 0.15s ease-out',
            transform: flipped
              ? 'rotateY(180deg)'
              : `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
            filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.5))',
            animation: flipped ? 'none' : 'floatCard 4s ease-in-out infinite',
          }}
        >

          {/* ── FRONT ─────────────────────────────── */}
          <div className="debit-card" style={{
            position: 'absolute', inset: 0,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            visibility: flipped ? 'hidden' : 'visible', 
            margin: 0, width: '100%', height: '100%',
            boxSizing: 'border-box', overflow: 'hidden',
          }}>
            {/* Moving shine on tilt */}
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 'inherit', pointerEvents: 'none',
              background: `radial-gradient(ellipse at ${50 + rotation.y * 2}% ${50 - rotation.x * 2}%,
                rgba(255,255,255,0.09) 0%, transparent 65%)`,
            }} />

            {/* Header */}
            <div className="card-header">
              <div>
                <span className="card-brand-name">TBC</span>
                <span className="card-brand-sub">BUSINESS COMMUNITY</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
                  stroke="rgba(255,255,255,0.6)" strokeWidth="1.8"
                  style={{ display: 'block', marginBottom: 2 }}>
                  <path d="M12 20c4.4 0 8-3.6 8-8s-3.6-8-8-8" strokeLinecap="round"/>
                  <path d="M12 16c2.2 0 4-1.8 4-4s-1.8-4-4-4" strokeLinecap="round"/>
                  <circle cx="12" cy="12" r="1" fill="rgba(255,255,255,0.6)" stroke="none"/>
                </svg>
                <span className="card-type">DEBIT</span>
              </div>
            </div>

            {/* Chip */}
            <div style={{ marginLeft: 2 }}>
              <svg viewBox="0 0 50 40" width="40" height="30">
                <rect x="2" y="2" width="46" height="36" rx="5"
                  fill="rgba(200,168,75,0.5)" stroke="rgba(200,168,75,0.4)" strokeWidth="1"/>
                {[9,21,33,41].map(x => (
                  <line key={x} x1={x} y1="2" x2={x} y2="38"
                    stroke="rgba(200,168,75,0.3)" strokeWidth="1.5"/>
                ))}
                {[13,27].map(y => (
                  <line key={y} x1="2" y1={y} x2="48" y2={y}
                    stroke="rgba(200,168,75,0.3)" strokeWidth="1.5"/>
                ))}
              </svg>
            </div>

            {/* Number */}
            <p className="card-number">{number}</p>

            {/* Footer */}
            <div className="card-footer">
              <div>
                <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, marginBottom: 2 }}>
                  CARD HOLDER
                </div>
                <p className="card-holder" style={{ margin: 0 }}>{name}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, marginBottom: 2 }}>
                  EXPIRES
                </div>
                <div style={{ fontSize: 12, color: '#fff', fontFamily: 'monospace' }}>12/28</div>
              </div>
            </div>
          </div>

          {/* ── BACK ──────────────────────────────── */}
          <div className="debit-card" style={{
            position: 'absolute', inset: 0,
            transform: 'rotateY(180deg)',
             visibility: flipped ? 'visible' : 'hidden',
            margin: 0, width: '100%', height: '100%',
            boxSizing: 'border-box', overflow: 'hidden',
            padding: 0,
          }}>
            {/* Magnetic strip */}
            <div style={{
              width: '100%', height: 36, marginTop: 22,
              background: 'linear-gradient(90deg, #0a0a0a 0%, #1c1c1c 50%, #0a0a0a 100%)',
            }} />

            {/* Signature + CVV */}
            <div style={{ padding: '12px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  flex: 1, height: 34, borderRadius: 4,
                  background: 'repeating-linear-gradient(45deg,#f5f0e8,#f5f0e8 4px,#e8e2d5 4px,#e8e2d5 8px)',
                  display: 'flex', alignItems: 'center', paddingLeft: 10,
                }}>
                  <span style={{ fontSize: 11, color: '#888', fontFamily: 'cursive' }}>
                    {name}
                  </span>
                </div>
                <div style={{
                  background: '#fff', borderRadius: 4,
                  padding: '4px 10px', textAlign: 'center', minWidth: 48,
                }}>
                  <div style={{ fontSize: 7, color: '#aaa', letterSpacing: 1 }}>CVV</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#111', fontFamily: 'monospace' }}>
                    ***
                  </div>
                </div>
              </div>

              <p style={{
                fontSize: 8, color: 'rgba(255,255,255,0.3)',
                lineHeight: 1.7, margin: '10px 0 0', letterSpacing: 0.3,
              }}>
                This card is property of Trillion Business Community.<br/>
                If found, please return to the nearest branch or call support.
              </p>

              {/* Network circles */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <div style={{ display: 'flex' }}>
                  {/* <div style={{
                    width: 26, height: 26, borderRadius: '50%',
                    background: 'rgba(235,77,40,0.85)', marginRight: -10,
                  }} />
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%',
                    background: 'rgba(255,165,0,0.85)',
                  }} /> */}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Hint */}
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12, textAlign: 'center' }}>
        {flipped ? 'Click to flip back' : 'Click to flip • Swipe on mobile'}
      </p>

      <style>{`
        @keyframes floatCard {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  );
}