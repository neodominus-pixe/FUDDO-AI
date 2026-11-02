/* FUDDO AI brand lockup.

   The mark is inline SVG rather than a PNG so it stays crisp at every size, can
   be recoloured by the theme, and costs no network request. Two pieces:

     <Mark/>      the badge on its own — favicons, avatars, tight bars.
     <Logo/>      badge + wordmark, the lockup used in navs and the footer.

   The wordmark is real text, not outlines, so it inherits the page font and
   stays selectable and searchable. */

export function Mark({ className = '', title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={`fuddo-mark ${className}`}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id="fuddo-badge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff9a4d" />
          <stop offset="0.55" stopColor="#f86a11" />
          <stop offset="1" stopColor="#d9480a" />
        </linearGradient>
      </defs>

      {/* The badge carries its own orange, so the mark reads identically on a
          white header, a black one, or a browser tab of unknown colour. */}
      <rect width="64" height="64" rx="16" fill="url(#fuddo-badge)" />

      {/* Plate, seen almost edge-on — the flat base the flame stands on. */}
      <ellipse cx="32" cy="48" rx="17" ry="4.4" fill="#fff" opacity="0.95" />
      <ellipse cx="32" cy="46.2" rx="11" ry="2.6" fill="#fff" opacity="0.45" />

      {/* Flame: heat, and the top half of the silhouette that survives at 16px. */}
      <path
        d="M32 12c8.2 8.6 12.4 14.4 12.4 20.8A12.4 12.4 0 0 1 19.6 33c0-4 1.9-7.3 5.2-10.4.2 3.1 1.3 5.2 3.4 6.3-1.4-6.6-.2-12 3.8-16.9Z"
        fill="#fff"
      />
      {/* Inner flame, knocked back to the badge colour so the shape has depth. */}
      <path
        d="M32.4 26.6c3.6 4 5.4 6.9 5.4 9.6a5.6 5.6 0 0 1-11.2.2c0-2.3 1.2-4.2 3.3-6 .1 1.7.7 2.8 1.7 3.4-.6-2.9-.3-5.1.8-7.2Z"
        fill="#f86a11"
        opacity="0.85"
      />
    </svg>
  )
}

export default function Logo({
  tagline = 'AI Plating Studio',
  size = 40,
  className = '',
}: {
  tagline?: string | null
  size?: number
  className?: string
}) {
  return (
    <span className={`fuddo-logo ${className}`} style={{ '--mark-size': `${size}px` } as React.CSSProperties}>
      <Mark />
      <span className="fuddo-word">
        <b>
          FUDDO<i>AI</i>
        </b>
        {tagline ? <small>{tagline}</small> : null}
      </span>
    </span>
  )
}
