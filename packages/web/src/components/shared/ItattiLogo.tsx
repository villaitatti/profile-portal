/**
 * Horizontal I Tatti logo: crimson mark + serif wordmark, inlined so it can
 * follow the theme (the PNG it replaces carried an anthracite wordmark that
 * vanished on dark surfaces). The wordmark uses currentColor; the mark uses
 * --crimson-mark, which stays the true saturated crimson in both themes.
 * Same asset as Libra's ItattiLogo, so the two apps share one wordmark.
 */
export function ItattiLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 283.33 66.15" role="img" aria-label="I Tatti" className={className}>
      <g fill="var(--crimson-mark)">
        <path d="m0 18.9 7.09 4.72h11.81v-9.45h-11.81z" />
        <path d="m56.69 18.9-7.08 4.72h-11.82v-9.45h11.82z" />
        <path d="m28.35 0-5.16 9.45h10.3z" />
        <path d="m33.07 14.17h-9.45v42.52l4.73 9.46 4.72-9.46z" />
        <path d="m37.8 36.29 7.09 20.4 9.43 4.72 2.37-9.45-12.89-23.61h-6z" />
        <path d="m18.9 36.29-7.09 20.4-9.44 4.72-2.37-9.45 12.9-23.61h6z" />
      </g>
      <g fill="currentColor">
        <path d="m90.27 15.9h-5.37v-.94h16.75v.94h-5.37v39.64h5.37v.94h-16.75v-.94h5.37z" />
        <path d="m132.98 15.9h-1.24c-10.5 0-12.86 1.59-12.86 11.27h-.94v-12.21h36.1v12.21h-.94c0-9.67-2.36-11.27-12.8-11.27h-1.3v39.64h6.08v.94h-18.17v-.94h6.08v-39.64z" />
        <path d="m174.33 43.03h-12.62l-2.42 7.43c-.41 1.18-.89 2.6-.89 3.6 0 .83.71 1.48 2.6 1.48h3.07v.94h-12.15v-.94h1.89c1.83 0 2.6-.18 3.72-3.48l12.68-38.05h.65l14.33 41.53h4.9v.94h-17.28v-.94h5.78l-4.25-12.51zm-6.37-18.82h-.12l-5.78 17.87h11.97l-6.08-17.87z" />
        <path d="m202.99 15.9h-1.24c-10.5 0-12.86 1.59-12.86 11.27h-.94v-12.21h36.1v12.21h-.94c0-9.67-2.36-11.27-12.8-11.27h-1.3v39.64h6.08v.94h-18.17v-.94h6.08v-39.64z" />
        <path d="m242.39 15.9h-1.24c-10.5 0-12.86 1.59-12.86 11.27h-.94v-12.21h36.1v12.21h-.94c0-9.67-2.36-11.27-12.8-11.27h-1.3v39.64h6.08v.94h-18.17v-.94h6.08v-39.64z" />
        <path d="m271.94 15.9h-5.37v-.94h16.75v.94h-5.37v39.64h5.37v.94h-16.75v-.94h5.37z" />
      </g>
    </svg>
  );
}
