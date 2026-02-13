import type { AvailabilityStatus } from './types';

/**
 * This file maps availability states to display labels and ranking scores.
 */

/**
 * Human-readable label shown in calendar cells and summary tables.
 */
export function getStatusLabel(status: AvailabilityStatus): string {
  if (status === 'available') {
    return 'Available';
  }

  if (status === 'maybe') {
    return 'Maybe';
  }

  if (status === 'unavailable') {
    return 'Unavailable';
  }

  return 'Unspecified';
}

/**
 * Numeric weight used by host summary ranking logic.
 * Higher values represent better scheduling outcomes.
 */
export function getStatusScore(status: AvailabilityStatus): number {
  if (status === 'available') {
    return 2;
  }

  if (status === 'maybe') {
    return 1;
  }

  if (status === 'unavailable') {
    return -2;
  }

  return 0;
}
