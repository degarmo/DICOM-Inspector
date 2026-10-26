/**
 * Content-Security-Policy for the renderer. No remote origins are ever allowed.
 *
 * Dev mode additionally permits what the Vite dev server needs on localhost:
 * inline module scripts (React Refresh preamble), injected <style> tags, and
 * the HMR websocket.
 */
export function contentSecurityPolicy(isDev: boolean): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'none'"],
    'script-src': isDev ? ["'self'", "'unsafe-inline'"] : ["'self'"],
    'style-src': isDev ? ["'self'", "'unsafe-inline'"] : ["'self'"],
    'font-src': ["'self'"],
    'img-src': ["'self'", 'data:'],
    'connect-src': isDev ? ["'self'", 'ws://localhost:*', 'ws://127.0.0.1:*'] : ["'none'"],
    'object-src': ["'none'"],
    'frame-src': ["'none'"],
    'worker-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'none'"],
  }
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ')
}
