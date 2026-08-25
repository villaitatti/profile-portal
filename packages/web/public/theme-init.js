// Applies the saved (or OS-preferred) theme before first paint to avoid a
// flash of the wrong theme. Loaded as an external classic script from
// index.html because the production CSP allows script-src 'self' only.
try {
  const theme = localStorage.getItem('profile-portal:theme');
  if (theme === 'dark' || (!theme && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
} catch {
  /* storage or matchMedia unavailable: keep the light default */
}
