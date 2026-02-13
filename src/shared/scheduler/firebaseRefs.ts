import { collection, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { APP_NAMESPACE } from './constants';

/**
 * This file provides Firestore reference builders scoped to the active campaign.
 * Returning `null` when Firebase is unavailable keeps caller logic explicit.
 */

/**
 * Root campaign document reference: `apps/{APP_NAMESPACE}`.
 */
export function getAppDocumentRef() {
  if (!db) {
    return null;
  }

  return doc(db, 'apps', APP_NAMESPACE);
}

/**
 * Users collection reference: `apps/{campaign}/users`.
 */
export function getUsersCollectionRef() {
  const appRef = getAppDocumentRef();
  return appRef ? collection(appRef, 'users') : null;
}

/**
 * Availability collection reference: `apps/{campaign}/availability`.
 */
export function getAvailabilityCollectionRef() {
  const appRef = getAppDocumentRef();
  return appRef ? collection(appRef, 'availability') : null;
}

/**
 * Settings document reference: `apps/{campaign}/meta/settings`.
 */
export function getSettingsDocumentRef() {
  const appRef = getAppDocumentRef();
  return appRef ? doc(appRef, 'meta', 'settings') : null;
}

/**
 * Invite collection reference: `apps/{campaign}/campaignInvites`.
 */
export function getCampaignInvitesCollectionRef() {
  const appRef = getAppDocumentRef();
  return appRef ? collection(appRef, 'campaignInvites') : null;
}
