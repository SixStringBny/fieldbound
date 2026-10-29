/**
 * Reduced-motion resolution (SHL-FR-04, PRD section 9).
 *
 * The operating-system preference is the initial value. An explicit in-app
 * override, when supplied, wins in both directions:
 *
 *   override === true  -> reduced motion, even if the OS asks for motion
 *   override === false -> full motion, even if the OS asks for less
 *   override == null   -> follow `prefers-reduced-motion`
 *
 * The hook never reads or writes storage; SHL-06 owns persistence and passes
 * the stored override in. The resolved boolean is rendered on the app root as
 * `data-reduced-motion="true|false"` (see `reducedMotionAttribute`), which is
 * what `motion.css` matches on.
 *
 * The system value is read synchronously in a lazy state initializer so the
 * first paint already honours the OS setting, then kept in sync through a
 * `change` listener that is removed on unmount.
 */
import { useEffect, useState } from 'react';

/** The exact media query from the game-shell motion contract. */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * In-app choice supplied by the caller. `null` and `undefined` both mean
 * "no explicit choice; follow the system".
 */
export type ReducedMotionOverride = boolean | null | undefined;

/** Read the OS preference once. Missing or throwing `matchMedia` means "off". */
export function getSystemReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  try {
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    return false;
  }
}

/**
 * Combine the system preference with an explicit override. Pure so the
 * precedence rule can be reasoned about (and tested) without React.
 */
export function resolveReducedMotion(
  systemReducedMotion: boolean,
  override: ReducedMotionOverride,
): boolean {
  return typeof override === 'boolean' ? override : systemReducedMotion;
}

/**
 * The literal attribute value for the app root. Strings are used rather than
 * the raw boolean so the attribute is always present and CSS can match
 * `[data-reduced-motion='false']` to restore motion against the OS query.
 */
export function reducedMotionAttribute(reduced: boolean): 'true' | 'false' {
  return reduced ? 'true' : 'false';
}

function subscribeToQuery(
  query: MediaQueryList,
  listener: (event: MediaQueryListEvent) => void,
): () => void {
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }

  // Legacy Safari only exposes the deprecated pair. Kept behind a feature
  // check so modern engines never call into it.
  query.addListener(listener);
  return () => query.removeListener(listener);
}

/**
 * Resolve reduced motion for the current render and keep following the OS
 * preference while mounted.
 */
export function useReducedMotion(
  override?: ReducedMotionOverride,
): boolean {
  const [systemReducedMotion, setSystemReducedMotion] = useState<boolean>(
    getSystemReducedMotion,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    let query: MediaQueryList;

    try {
      query = window.matchMedia(REDUCED_MOTION_QUERY);
    } catch {
      return;
    }

    const handleChange = (event: MediaQueryListEvent) => {
      setSystemReducedMotion(event.matches);
    };

    // Re-sync once on subscribe: the preference may have changed between the
    // initial render and the effect running.
    setSystemReducedMotion(query.matches);

    return subscribeToQuery(query, handleChange);
  }, []);

  return resolveReducedMotion(systemReducedMotion, override);
}
