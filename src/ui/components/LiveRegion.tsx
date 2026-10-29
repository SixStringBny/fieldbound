/**
 * The single polite live region (SHL-FR-06, PRD section 9).
 *
 * One region is mounted by `App` for the whole session. Screens publish one
 * settled message per transition through the `onAnnounce` callback they are
 * given; they never render a second region of their own. Replacing the text
 * (rather than appending) is what keeps a repeated transition from being read
 * twice, and the caller is responsible for making consecutive messages
 * distinct where a repetition must still be spoken.
 *
 * The region is visually hidden but never `display: none`: assistive
 * technology must keep it in the accessibility tree for the text change to be
 * announced. `role="status"` already implies `aria-live="polite"` and
 * `aria-atomic="true"`; the explicit attributes document the contract and keep
 * it stable across role polyfills.
 */
export interface LiveRegionProps {
  /** The latest settled announcement; an empty string means "nothing new". */
  readonly message: string;
}

export function LiveRegion({ message }: LiveRegionProps) {
  return (
    <div
      className="live-region visually-hidden"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-live-region="true"
    >
      {message}
    </div>
  );
}
