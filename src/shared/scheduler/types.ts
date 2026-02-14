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
 * A user profile stored under `apps/{namespace}/users/{uid}`.
 */
export type UserProfile = {
  id: string;
  /**
   * Pseudonymous in-app identifier derived from uid.
   */
  alias: string;
  role: UserRole;
};

/**
 * A campaign document stored under `apps/{namespace}/campaigns/{campaignId}`.
 */
export type Campaign = {
  id: string;
  name: string;
  inviteCode: string;
  inviteEnabled: boolean;
  createdByUid: string;
};

/**
 * A membership document stored under `apps/{namespace}/memberships/{campaignId_uid}`.
 */
export type CampaignMembership = {
  id: string;
  campaignId: string;
  userId: string;
  /**
   * Snapshot of the user's current in-app alias for this membership.
   */
  alias: string;
};

/**
 * An invite document stored under `apps/{namespace}/campaignInvites/{code}`.
 */
export type CampaignInvite = {
  code: string;
  campaignId: string;
  enabled: boolean;
  createdByUid: string;
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
