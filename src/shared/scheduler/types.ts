/**
 * This file centralizes the core domain types used by the scheduler application.
 * Keeping these shared contracts in one place prevents circular imports and
 * keeps feature modules aligned on the same data model.
 */

/**
 * A single-day availability state selected by a user.
 */
export type AvailabilityStatus = 'unspecified' | 'available' | 'maybe' | 'unavailable';

/**
 * Access levels recognized by the app.
 */
export type UserRole = 'member' | 'admin';

/**
 * A user profile stored under `apps/{campaignId}/users/{uid}`.
 */
export type UserProfile = {
  id: string;
  name: string;
  role: UserRole;
  email: string;
};

/**
 * An invite document stored under `apps/{campaignId}/campaignInvites/{code}`.
 */
export type CampaignInvite = {
  code: string;
  campaignId: string;
  role: UserRole;
  createdByUid: string;
  redeemedByUid: string;
  revoked: boolean;
};

/**
 * Availability map keyed first by user id, then by date key (`YYYY-MM-DD`).
 */
export type AvailabilityByUser = Record<string, Record<string, AvailabilityStatus>>;

/**
 * The synchronized application state backed by Firestore snapshots.
 */
export type PersistedState = {
  users: UserProfile[];
  hostUserId: string;
  availability: AvailabilityByUser;
};

/**
 * Local-only unsaved edits keyed by user id and date key.
 */
export type PendingEditsByUser = Record<string, Record<string, AvailabilityStatus>>;

/**
 * Default empty state used during sign-out and pre-load phases.
 */
export const INITIAL_PERSISTED_STATE: PersistedState = {
  users: [],
  hostUserId: '',
  availability: {}
};
