// src/components/layout/NotifBadge.tsx
// Gold circle with a count. Renders nothing at zero, so a badge on screen
// always means there is something waiting.
export default function NotifBadge({
  count,
  title,
  className,
  style,
}: {
  count: number;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (!count || count < 1) return null;
  return (
    <span className={`notif-badge${className ? ` ${className}` : ''}`} title={title} style={style}>
      {count > 99 ? '99+' : count}
    </span>
  );
}
