// Shared by the root layout (a server component) and lib/install.ts.

/**
 * Runs in <head> so a `beforeinstallprompt` that fires before React hydrates is kept for our
 * Install button (lib/install.ts) instead of being lost.
 */
export const installCaptureScript = `window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__gmrInstallPrompt=e});`;
