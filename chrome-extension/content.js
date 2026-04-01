/**
 * Atlas Job OS — Content Script
 * Injected into all pages. Provides a message interface for the background worker.
 */

// Signal to background that content script is ready
chrome.runtime.sendMessage({ type: "content_ready", url: window.location.href }).catch(() => {});
