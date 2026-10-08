/**
 * Siglele Messenger și Instagram, desenate ca SVG.
 *
 * Sunt marcaje înregistrate — le folosim doar ca să se vadă din ce platformă
 * vine o conversație, cu formele și culorile oficiale.
 */

export function MessengerIcon({ className = 'h-4 w-4', gradient = true, id = 'msg' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {gradient && (
        <defs>
          <linearGradient id={`${id}-grad`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#0099FF" />
            <stop offset="60%" stopColor="#A033FF" />
            <stop offset="90%" stopColor="#FF5280" />
            <stop offset="100%" stopColor="#FF7061" />
          </linearGradient>
        </defs>
      )}
      <path
        fill={gradient ? `url(#${id}-grad)` : 'currentColor'}
        d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.19.16.15.26.35.27.57l.05 1.78c.02.57.6.94 1.12.71l1.99-.88c.17-.07.36-.09.53-.04 1.19.33 2.45.5 3.9.5 5.64 0 10-4.13 10-9.7S17.64 2 12 2z"
      />
      <path
        fill="#fff"
        d="M6 14.55l2.94-4.66c.47-.74 1.47-.93 2.18-.4l2.34 1.75c.21.16.5.16.72 0l3.16-2.4c.42-.32.97.18.68.63l-2.94 4.66c-.47.74-1.47.93-2.18.4l-2.34-1.75a.6.6 0 00-.72 0l-3.16 2.4c-.42.32-.97-.18-.68-.63z"
      />
    </svg>
  )
}

export function InstagramIcon({ className = 'h-4 w-4', gradient = true, id = 'ig' }) {
  const fill = gradient ? `url(#${id}-grad)` : 'currentColor'
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {gradient && (
        <defs>
          <radialGradient id={`${id}-grad`} cx="30%" cy="107%" r="150%">
            <stop offset="0%" stopColor="#FDF497" />
            <stop offset="25%" stopColor="#FD5949" />
            <stop offset="50%" stopColor="#D6249F" />
            <stop offset="100%" stopColor="#285AEB" />
          </radialGradient>
        </defs>
      )}
      <path
        fill={fill}
        d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41 1.27-.06 1.65-.07 4.85-.07M12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.79.31-1.46.72-2.13 1.38C1.35 2.68.94 3.35.63 4.14.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.31.79.72 1.46 1.38 2.13.67.67 1.34 1.08 2.13 1.38.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56.79-.31 1.46-.72 2.13-1.38.67-.67 1.08-1.34 1.38-2.13.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91-.31-.79-.72-1.46-1.38-2.13C21.32 1.35 20.65.94 19.86.63c-.76-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0z"
      />
      <path
        fill={fill}
        d="M12 5.84a6.16 6.16 0 100 12.32 6.16 6.16 0 000-12.32zm0 10.16a4 4 0 110-8 4 4 0 010 8z"
      />
      <circle fill={fill} cx="18.41" cy="5.59" r="1.44" />
    </svg>
  )
}

/** Sigla platformei din care vine conversația. */
export function PlatformIcon({ platform, className, id }) {
  return platform === 'instagram'
    ? <InstagramIcon className={className} id={id} />
    : <MessengerIcon className={className} id={id} />
}
