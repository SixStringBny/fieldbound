/**
 * Small shared view types for the battle presentation layer.
 */
import type { CardDefinition } from '../../engine/types';

/**
 * Read-only card lookup supplied by the controller. A missing id is explicit so
 * the board can render a stable fallback instead of throwing.
 */
export type CardCatalogView = Readonly<
  Record<string, CardDefinition | undefined>
>;
