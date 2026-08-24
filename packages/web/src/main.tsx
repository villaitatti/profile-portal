import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadRuntimeConfig } from './config/runtime';
import './styles/globals.css';

/**
 * Promotes the preloaded Typekit stylesheet (see index.html) so the webfont
 * applies without ever having blocked first paint.
 */
function applyWebFonts() {
  const preloaded = document.getElementById('typekit-css');
  if (preloaded instanceof HTMLLinkElement) {
    preloaded.rel = 'stylesheet';
    return;
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://use.typekit.net/prv7fdz.css';
  document.head.appendChild(link);
}

/**
 * Last-resort fallback for a failed boot. Runs above the React ErrorBoundary —
 * typically when a cached index.html points at an App chunk a redeploy has
 * removed — so it must not touch any app code or stylesheet.
 */
function renderBootFailure() {
  const host = document.getElementById('root') ?? document.body;
  host.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.setAttribute('role', 'alert');
  wrapper.setAttribute(
    'style',
    'max-width:28rem;margin:5rem auto;padding:0 1rem;text-align:center;font-family:system-ui,sans-serif;color:#1d252c'
  );

  const heading = document.createElement('h1');
  heading.textContent = 'Page temporarily unavailable';
  heading.setAttribute('style', 'font-size:1.5rem;font-weight:700;margin:0 0 0.5rem');

  const body = document.createElement('p');
  body.textContent =
    'The application files could not be loaded. Reload the page to fetch the latest version.';
  body.setAttribute('style', 'margin:0;color:#5b666f');

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Reload page';
  button.setAttribute(
    'style',
    'margin-top:1.5rem;padding:0.5rem 1rem;border:0;border-radius:0.375rem;background:#1d252c;color:#fff;font:inherit;cursor:pointer'
  );
  button.addEventListener('click', () => window.location.reload());

  wrapper.append(heading, body, button);
  host.appendChild(wrapper);
}

async function bootstrap() {
  await loadRuntimeConfig();
  const { default: App } = await import('./App');

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

applyWebFonts();

void bootstrap().catch((err) => {
  console.error('[bootstrap] failed to start the application', err);
  renderBootFailure();
});
