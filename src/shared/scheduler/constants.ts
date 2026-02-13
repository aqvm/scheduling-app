import type { AvailabilityStatus } from './types';

/**
 * This file contains configuration and display constants shared across features.
 * Values are grouped here so components stay focused on rendering behavior.
 */

/**
 * Backward-compatible static member invite code used when invite documents are absent.
 */
export const LEGACY_MEMBER_INVITE_CODE = import.meta.env.VITE_MEMBER_INVITE_CODE ?? 'party-members';

/**
 * Backward-compatible static admin invite code used when invite documents are absent.
 */
export const LEGACY_ADMIN_INVITE_CODE = import.meta.env.VITE_ADMIN_INVITE_CODE ?? 'owner-admin';

/**
 * Namespace key used as the campaign/document partition inside Firestore.
 */
export const APP_NAMESPACE = import.meta.env.VITE_FIREBASE_APP_NAMESPACE ?? 'default';

/**
 * Weekday headers rendered in calendar order.
 */
export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * Paint modes shown in the availability toolbar.
 */
export const PAINT_OPTIONS: Array<{ status: AvailabilityStatus; label: string }> = [
  { status: 'available', label: 'Available' },
  { status: 'maybe', label: 'Maybe' },
  { status: 'unavailable', label: 'Unavailable' },
  { status: 'unspecified', label: 'Clear' }
];

/**
 * Month display labels indexed by JavaScript month order (`0` => January).
 */
export const MONTH_NAME_OPTIONS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
] as const;
