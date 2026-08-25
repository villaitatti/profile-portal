import '@testing-library/jest-dom/vitest';
// Initialize i18n (English default) so components using useTranslation render
// their strings in tests without each file wiring a provider.
import '../i18n/config';

// Polyfill ResizeObserver for jsdom (required by cmdk)
(globalThis as Record<string, unknown>).ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Polyfill scrollIntoView for jsdom (required by cmdk)
Element.prototype.scrollIntoView = function () {};

// Polyfill hasPointerCapture for jsdom (required by Radix)
Element.prototype.hasPointerCapture = function () { return false; };
