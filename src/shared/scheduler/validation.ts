import type { AvailabilityStatus, UserRole } from './types';

/**
 * This file groups type guards and normalization helpers used at trust boundaries
 * (user input and Firestore data).
 */

/**
 * Runtime guard that validates whether a value is an availability enum member.
 */
export function isAvailabilityStatus(value: unknown): value is AvailabilityStatus {
  return (
    typeof value === 'string' &&
    (value === 'unspecified' || value === 'available' || value === 'maybe' || value === 'unavailable')
  );
}

/**
 * Runtime guard that validates whether a value is a user role.
 */
export function isUserRole(value: unknown): value is UserRole {
  return value === 'member' || value === 'admin';
}

/**
 * Collapses extra whitespace and trims user-provided labels (campaign names, aliases).
 */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/**
 * Normalizes invite codes so users can enter mixed case/spacing safely.
 */
export function normalizeInviteCode(value: string): string {
  return value.trim().toLowerCase();
}
