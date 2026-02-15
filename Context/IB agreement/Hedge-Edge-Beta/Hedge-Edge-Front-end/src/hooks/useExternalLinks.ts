/**
 * External Link Interceptor Hook
 *
 * Prevents accidental navigation by intercepting all external link clicks
 * and routing them through Electron's openExternal (which validates the URL
 * in the main process) or falling back to window.open with noopener/noreferrer.
 *
 * Mount once at the root of the React tree (App.tsx).
 */

import { useEffect } from 'react';

export function useExternalLinkInterceptor(): void {
  useEffect(() => {
    function handleClick(event: MouseEvent): void {
      const target = (event.target as HTMLElement).closest('a');
      if (!target) return;

      const href = target.getAttribute('href');
      if (!href) return;

      // Skip internal / hash / relative links
      if (href.startsWith('#') || href.startsWith('/') || href.startsWith('.')) return;

      // External link detected
      if (href.startsWith('http://') || href.startsWith('https://')) {
        event.preventDefault();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bridge = (window as any).electronAPI;
        if (bridge?.openExternal) {
          // Routed through main process URL validation (see preload.ts)
          bridge.openExternal(href);
        } else {
          window.open(href, '_blank', 'noopener,noreferrer');
        }
      }
    }

    // Use capture phase to intercept before any other click handler
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, []);
}
