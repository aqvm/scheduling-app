import { collection, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { APP_NAMESPACE } from './constants';

/**
 * This file provides Firestore reference builders scoped to the app namespace.
 * Returning `null` when Firebase is unavailable keeps caller logic explicit.
 */

/**
 * Root app namespace document reference: `apps/{APP_NAMESPACE}`.
 */
export function getAppDocumentRef() {
  if (!db) {
    return null;
  }

  return doc(db, 'apps', APP_NAMESPACE);
}

/**
 * Users collection reference: `apps/{namespace}/users`.
 */
export function getUsersCollectionRef() {
  const appRef = getAppDocumentRef();
  return appRef ? collection(appRef, 'users') : null;
}

/**
 * Availability collection reference: `apps/{namespace}/availability`.
 */
export function getAvailabilityCollectionRef() {
  const appRef = getAppDocumentRef();
  return appRef ? collection(appRef, 'availability') : null;
}

/**
 * Campaign settings collection reference: `apps/{namespace}/campaignSettings`.
 */
export function getCampaignSettingsCollectionRef() {
  const appRef = getAppDocumentRef();
  return appRef ? collection(appRef, 'campaignSettings') : null;
}

/**
 * Settings document reference for one campaign.
 */
export function getCampaignSettingsDocumentRef(campaignId: string) {
  const settingsRef = getCampaignSettingsCollectionRef();
  return settingsRef ? doc(settingsRef, campaignId) : null;
}

/**
 * Invite collection reference: `apps/{namespace}/campaignInvites`.
 */
export function getCampaignInvitesCollectionRef() {
  const appRef = getAppDocumentRef();
  return appRef ? collection(appRef, 'campaignInvites') : null;
}

/**
 * Campaigns collection reference: `apps/{namespace}/campaigns`.
 */
export function getCampaignsCollectionRef() {
  const appRef = getAppDocumentRef();
  return appRef ? collection(appRef, 'campaigns') : null;
}

/**
 * Memberships collection reference: `apps/{namespace}/memberships`.
 */
export function getMembershipsCollectionRef() {
  const appRef = getAppDocumentRef();
  return appRef ? collection(appRef, 'memberships') : null;
}
