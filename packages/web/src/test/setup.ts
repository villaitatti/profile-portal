import '@testing-library/jest-dom/vitest';

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
