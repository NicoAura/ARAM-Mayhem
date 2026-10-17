// In the browser: whether this visitor has signed in to /admin (lib/admin-session.ts sets the flag).
// Only decides whether to try loading admin-only files; the server checks the real sign-in.
export const adminFlag = () => typeof document !== "undefined" && /(?:^|;\s*)deeparam-admin-ui=1/.test(document.cookie);
