'use client';
// src/components/cards/DebitCard.tsx

interface Props {
  name:   string;
  number?: string;
}

export default function DebitCard({ name, number = '**** **** **** 3456' }: Props) {
  return (
    <div className="debit-card">
      {/* Header */}
      <div className="card-header">
        <div>
          <span className="card-brand-name">TBC</span>
          <span className="card-brand-sub">BUSINESS COMMUNITY</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          {/* NFC icon */}
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
            stroke="rgba(255,255,255,0.6)" strokeWidth="1.8" style={{ display:'block', marginBottom: 2 }}>
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
          <line x1="9"  y1="2"  x2="9"  y2="38" stroke="rgba(200,168,75,0.3)" strokeWidth="1.5"/>
          <line x1="21" y1="2"  x2="21" y2="38" stroke="rgba(200,168,75,0.3)" strokeWidth="1.5"/>
          <line x1="33" y1="2"  x2="33" y2="38" stroke="rgba(200,168,75,0.3)" strokeWidth="1.5"/>
          <line x1="41" y1="2"  x2="41" y2="38" stroke="rgba(200,168,75,0.3)" strokeWidth="1.5"/>
          <line x1="2"  y1="13" x2="48" y2="13" stroke="rgba(200,168,75,0.3)" strokeWidth="1.5"/>
          <line x1="2"  y1="27" x2="48" y2="27" stroke="rgba(200,168,75,0.3)" strokeWidth="1.5"/>
        </svg>
      </div>

      {/* Card Number */}
      <p className="card-number">{number}</p>

      {/* Footer */}
      <div className="card-footer">
        <p className="card-holder">{name}</p>
        {/* Mastercard circles */}
        {/* <svg viewBox="0 0 50 32" width="40" height="26">
          <circle cx="18" cy="16" r="16" fill="#eb001b" opacity=".9"/>
          <circle cx="32" cy="16" r="16" fill="#f79e1b" opacity=".9"/>
          <path d="M25 4.8a16 16 0 0 1 0 22.4A16 16 0 0 1 25 4.8z" fill="#ff5f00" opacity=".8"/>
        </svg> */}
      </div>
    </div>
  );
}
