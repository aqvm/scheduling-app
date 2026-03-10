import {
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type Firestore
} from 'firebase/firestore';
import {
  getAvailabilityCollectionRef,
  getCampaignInvitesCollectionRef,
  getCampaignSettingsCollectionRef,
  getCampaignSettingsDocumentRef,
  getCampaignsCollectionRef,
  getMembershipsCollectionRef,
  getNameChangeRequestsCollectionRef,
  getUsersCollectionRef
} from '../../../shared/scheduler/firebaseRefs';
import { createInviteCode } from '../../../shared/scheduler/invite';
import { isNameChangeRequestStatus, isUserRole, normalizeInviteCode, normalizeName } from '../../../shared/scheduler/validation';
import { createUserAlias, MAX_INVITE_CREATE_ATTEMPTS, membershipDocumentId } from '../utils';

type JoinCampaignWithInviteArgs = {
  firestore: Firestore;
  signedInUserId: string;
  inviteCode: string;
  requestedAlias: string;
};

export async function joinCampaignWithInvite({
  firestore,
  signedInUserId,
  inviteCode,
  requestedAlias
}: JoinCampaignWithInviteArgs): Promise<string> {
  const usersRef = getUsersCollectionRef();
  const invitesRef = getCampaignInvitesCollectionRef();
  const membershipsRef = getMembershipsCollectionRef();
  if (!usersRef || !invitesRef || !membershipsRef) {
    throw new Error('Firebase is not configured.');
  }

  const userDocRef = doc(usersRef, signedInUserId);

  const inviteCampaignId = await runTransaction(firestore, async (transaction) => {
    const userSnapshot = await transaction.get(userDocRef);
    let nextInviteCampaignId = '';

    const inviteDocRef = doc(invitesRef, inviteCode);
    const inviteSnapshot = await transaction.get(inviteDocRef);

    if (!inviteSnapshot.exists()) {
      throw new Error('Invalid invite code.');
    }

    const inviteValue = inviteSnapshot.data();
    const campaignId = typeof inviteValue.campaignId === 'string' ? inviteValue.campaignId : '';
    const enabled = inviteValue.enabled === true;

    if (!campaignId) {
      throw new Error('Invite code is misconfigured.');
    }

    const membershipDocRef = doc(membershipsRef, membershipDocumentId(campaignId, signedInUserId));
    const membershipSnapshot = await transaction.get(membershipDocRef);
    const hasExistingMembership = membershipSnapshot.exists();

    const existingMembershipAlias =
      hasExistingMembership && typeof membershipSnapshot.data().alias === 'string'
        ? normalizeName(membershipSnapshot.data().alias)
        : '';

    if (!enabled && !hasExistingMembership) {
      throw new Error('This invite code is disabled.');
    }

    const existingUserAlias =
      userSnapshot.exists() && typeof userSnapshot.data().alias === 'string'
        ? normalizeName(userSnapshot.data().alias)
        : '';
    const fallbackUserAlias = existingUserAlias || createUserAlias(signedInUserId);
    const effectiveMembershipAlias = hasExistingMembership
      ? existingMembershipAlias || fallbackUserAlias
      : requestedAlias;
    const nextUserAlias =
      hasExistingMembership || requestedAlias.length === 0 ? fallbackUserAlias : requestedAlias;

    if (!effectiveMembershipAlias) {
      throw new Error(
        hasExistingMembership
          ? 'Membership name is invalid.'
          : 'Enter a name before joining this campaign.'
      );
    }

    const existingJoinedAt = hasExistingMembership ? membershipSnapshot.data().joinedAt : null;
    if (hasExistingMembership && !existingJoinedAt) {
      throw new Error('Membership record is invalid.');
    }

    nextInviteCampaignId = campaignId;

    transaction.set(membershipDocRef, {
      campaignId,
      uid: signedInUserId,
      alias: effectiveMembershipAlias,
      joinedAt: hasExistingMembership ? existingJoinedAt : serverTimestamp(),
      lastSeenAt: serverTimestamp()
    });

    if (userSnapshot.exists()) {
      const existingRole = userSnapshot.data().role;
      if (!isUserRole(existingRole)) {
        throw new Error('Profile role is invalid.');
      }

      const existingCreatedAt = userSnapshot.data().createdAt;
      if (!existingCreatedAt) {
        throw new Error('Profile created timestamp is invalid.');
      }

      transaction.set(userDocRef, {
        alias: nextUserAlias,
        role: existingRole,
        createdAt: existingCreatedAt,
        lastSeenAt: serverTimestamp()
      });
    } else {
      transaction.set(userDocRef, {
        alias: nextUserAlias,
        role: 'member',
        createdAt: serverTimestamp(),
        lastSeenAt: serverTimestamp()
      });
    }

    return nextInviteCampaignId;
  });

  return inviteCampaignId;
}

type SubmitNameChangeRequestArgs = {
  firestore: Firestore;
  campaignId: string;
  userId: string;
  requestedAlias: string;
};

export async function submitNameChangeRequest({
  firestore,
  campaignId,
  userId,
  requestedAlias
}: SubmitNameChangeRequestArgs): Promise<void> {
  const nameChangeRequestsRef = getNameChangeRequestsCollectionRef();
  if (!nameChangeRequestsRef) {
    throw new Error('Firebase is not configured.');
  }

  const requestDocRef = doc(nameChangeRequestsRef, membershipDocumentId(campaignId, userId));

  await runTransaction(firestore, async (transaction) => {
    const existingRequestSnapshot = await transaction.get(requestDocRef);
    const existingCreatedAt =
      existingRequestSnapshot.exists() && existingRequestSnapshot.data().createdAt
        ? existingRequestSnapshot.data().createdAt
        : serverTimestamp();

    transaction.set(requestDocRef, {
      campaignId,
      uid: userId,
      requestedAlias,
      status: 'pending',
      createdByUid: userId,
      reviewedByUid: '',
      createdAt: existingCreatedAt,
      updatedAt: serverTimestamp()
    });
  });
}

type ReviewNameChangeRequestArgs = {
  firestore: Firestore;
  selectedCampaignId: string;
  requestId: string;
  reviewerUserId: string;
  nextStatus: 'approved' | 'rejected';
};

export async function reviewNameChangeRequest({
  firestore,
  selectedCampaignId,
  requestId,
  reviewerUserId,
  nextStatus
}: ReviewNameChangeRequestArgs): Promise<void> {
  const nameChangeRequestsRef = getNameChangeRequestsCollectionRef();
  const membershipsRef = getMembershipsCollectionRef();
  if (!nameChangeRequestsRef || !membershipsRef) {
    throw new Error('Firebase is not configured.');
  }

  const requestDocRef = doc(nameChangeRequestsRef, requestId);

  await runTransaction(firestore, async (transaction) => {
    const requestSnapshot = await transaction.get(requestDocRef);
    if (!requestSnapshot.exists()) {
      throw new Error('Name change request no longer exists.');
    }

    const requestValue = requestSnapshot.data();
    const requestCampaignId = typeof requestValue.campaignId === 'string' ? requestValue.campaignId : '';
    const requestUserId = typeof requestValue.uid === 'string' ? requestValue.uid : '';
    const requestedAlias =
      typeof requestValue.requestedAlias === 'string' ? normalizeName(requestValue.requestedAlias) : '';
    const requestStatus = requestValue.status;
    const createdByUid = typeof requestValue.createdByUid === 'string' ? requestValue.createdByUid : '';
    const createdAt = requestValue.createdAt;

    if (
      !requestCampaignId ||
      !requestUserId ||
      !requestedAlias ||
      !createdByUid ||
      !createdAt ||
      !isNameChangeRequestStatus(requestStatus)
    ) {
      throw new Error('Name change request is invalid.');
    }

    if (requestCampaignId !== selectedCampaignId) {
      throw new Error('Name change request campaign does not match the selected campaign.');
    }

    if (requestStatus !== 'pending') {
      throw new Error('Name change request was already reviewed.');
    }

    if (nextStatus === 'approved') {
      const membershipDocRef = doc(membershipsRef, membershipDocumentId(requestCampaignId, requestUserId));
      const membershipSnapshot = await transaction.get(membershipDocRef);
      if (!membershipSnapshot.exists()) {
        throw new Error('Campaign membership no longer exists for this request.');
      }

      const membershipValue = membershipSnapshot.data();
      const joinedAt = membershipValue.joinedAt;
      if (!joinedAt) {
        throw new Error('Campaign membership timestamp is invalid.');
      }

      transaction.set(membershipDocRef, {
        campaignId: requestCampaignId,
        uid: requestUserId,
        alias: requestedAlias,
        joinedAt,
        lastSeenAt: serverTimestamp()
      });
    }

    transaction.set(requestDocRef, {
      campaignId: requestCampaignId,
      uid: requestUserId,
      requestedAlias,
      status: nextStatus,
      createdByUid,
      reviewedByUid: reviewerUserId,
      createdAt,
      updatedAt: serverTimestamp()
    });
  });
}

type CreateCampaignArgs = {
  firestore: Firestore;
  currentUserId: string;
  campaignName: string;
  currentUserAlias: string;
  displayAlias: string;
};

export async function createCampaign({
  firestore,
  currentUserId,
  campaignName,
  currentUserAlias,
  displayAlias
}: CreateCampaignArgs): Promise<string> {
  const campaignsRef = getCampaignsCollectionRef();
  const invitesRef = getCampaignInvitesCollectionRef();
  const membershipsRef = getMembershipsCollectionRef();
  const settingsRef = getCampaignSettingsCollectionRef();
  if (!campaignsRef || !invitesRef || !membershipsRef || !settingsRef) {
    throw new Error('Firebase is not configured.');
  }

  for (let attempt = 0; attempt < MAX_INVITE_CREATE_ATTEMPTS; attempt += 1) {
    const inviteCode = normalizeInviteCode(createInviteCode());
    const campaignDocRef = doc(campaignsRef);
    const inviteDocRef = doc(invitesRef, inviteCode);
    const membershipDocRef = doc(membershipsRef, membershipDocumentId(campaignDocRef.id, currentUserId));
    const campaignSettingsDocRef = doc(settingsRef, campaignDocRef.id);

    try {
      await runTransaction(firestore, async (transaction) => {
        const inviteSnapshot = await transaction.get(inviteDocRef);
        if (inviteSnapshot.exists()) {
          throw new Error('INVITE_CODE_CONFLICT');
        }

        transaction.set(campaignDocRef, {
          name: campaignName,
          inviteCode,
          inviteEnabled: true,
          createdByUid: currentUserId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        transaction.set(inviteDocRef, {
          campaignId: campaignDocRef.id,
          enabled: true,
          createdByUid: currentUserId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        transaction.set(membershipDocRef, {
          campaignId: campaignDocRef.id,
          uid: currentUserId,
          alias: displayAlias || currentUserAlias,
          joinedAt: serverTimestamp(),
          lastSeenAt: serverTimestamp()
        });
        transaction.set(
          campaignSettingsDocRef,
          {
            hostUserId: currentUserId,
            updatedAt: serverTimestamp()
          },
          { merge: true }
        );
      });

      return campaignDocRef.id;
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'INVITE_CODE_CONFLICT') {
        continue;
      }

      throw error;
    }
  }

  throw new Error('Unable to generate a unique invite code.');
}

type SetInviteEnabledArgs = {
  firestore: Firestore;
  campaignId: string;
  inviteCode: string;
  enabled: boolean;
};

export async function setInviteEnabled({
  firestore,
  campaignId,
  inviteCode,
  enabled
}: SetInviteEnabledArgs): Promise<void> {
  const campaignsRef = getCampaignsCollectionRef();
  const invitesRef = getCampaignInvitesCollectionRef();
  if (!campaignsRef || !invitesRef) {
    throw new Error('Firebase is not configured.');
  }

  const campaignDocRef = doc(campaignsRef, campaignId);
  const inviteDocRef = doc(invitesRef, inviteCode);

  await runTransaction(firestore, async (transaction) => {
    const campaignSnapshot = await transaction.get(campaignDocRef);
    if (!campaignSnapshot.exists()) {
      throw new Error('Selected campaign no longer exists.');
    }

    const inviteSnapshot = await transaction.get(inviteDocRef);
    if (!inviteSnapshot.exists()) {
      throw new Error('Campaign invite code is missing.');
    }

    transaction.set(
      campaignDocRef,
      {
        inviteEnabled: enabled,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
    transaction.set(
      inviteDocRef,
      {
        enabled,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
  });
}

type DeleteCampaignArgs = {
  firestore: Firestore;
  campaignId: string;
  inviteCode: string;
};

export async function deleteCampaign({
  firestore,
  campaignId,
  inviteCode
}: DeleteCampaignArgs): Promise<void> {
  const campaignsRef = getCampaignsCollectionRef();
  const invitesRef = getCampaignInvitesCollectionRef();
  const membershipsRef = getMembershipsCollectionRef();
  const availabilityRef = getAvailabilityCollectionRef();
  const nameChangeRequestsRef = getNameChangeRequestsCollectionRef();
  const settingsDocRef = getCampaignSettingsDocumentRef(campaignId);
  if (
    !campaignsRef ||
    !invitesRef ||
    !membershipsRef ||
    !availabilityRef ||
    !nameChangeRequestsRef ||
    !settingsDocRef
  ) {
    throw new Error('Firebase is not configured.');
  }

  const campaignDocRef = doc(campaignsRef, campaignId);
  const inviteDocRef = doc(invitesRef, inviteCode);
  const membershipsQuery = query(membershipsRef, where('campaignId', '==', campaignId));
  const availabilityQuery = query(availabilityRef, where('campaignId', '==', campaignId));
  const nameChangeRequestsQuery = query(nameChangeRequestsRef, where('campaignId', '==', campaignId));

  const [membershipsSnapshot, availabilitySnapshot, nameChangeRequestsSnapshot] = await Promise.all([
    getDocs(membershipsQuery),
    getDocs(availabilityQuery),
    getDocs(nameChangeRequestsQuery)
  ]);

  const docsToDelete = [
    campaignDocRef,
    inviteDocRef,
    settingsDocRef,
    ...membershipsSnapshot.docs.map((membershipDoc) => membershipDoc.ref),
    ...availabilitySnapshot.docs.map((availabilityDoc) => availabilityDoc.ref),
    ...nameChangeRequestsSnapshot.docs.map((requestDoc) => requestDoc.ref)
  ];

  // Keep each commit under Firestore per-batch operation limits.
  const BATCH_DELETE_SIZE = 450;
  for (let index = 0; index < docsToDelete.length; index += BATCH_DELETE_SIZE) {
    const deleteBatch = writeBatch(firestore);
    const docsInBatch = docsToDelete.slice(index, index + BATCH_DELETE_SIZE);
    docsInBatch.forEach((docRef) => {
      deleteBatch.delete(docRef);
    });
    await deleteBatch.commit();
  }
}

type KickUserFromCampaignArgs = {
  firestore: Firestore;
  campaignId: string;
  userId: string;
  hostUserId: string;
  campaignUserIds: string[];
};

export async function kickUserFromCampaign({
  firestore,
  campaignId,
  userId,
  hostUserId,
  campaignUserIds
}: KickUserFromCampaignArgs): Promise<void> {
  const membershipsRef = getMembershipsCollectionRef();
  const availabilityRef = getAvailabilityCollectionRef();
  const nameChangeRequestsRef = getNameChangeRequestsCollectionRef();
  const settingsDocRef = getCampaignSettingsDocumentRef(campaignId);
  if (!membershipsRef || !availabilityRef || !nameChangeRequestsRef || !settingsDocRef) {
    throw new Error('Firebase is not configured.');
  }

  const membershipDocRef = doc(membershipsRef, membershipDocumentId(campaignId, userId));
  const availabilityDocRef = doc(availabilityRef, membershipDocumentId(campaignId, userId));
  const requestDocRef = doc(nameChangeRequestsRef, membershipDocumentId(campaignId, userId));
  const fallbackHostUserId =
    hostUserId === userId ? campaignUserIds.find((candidateUserId) => candidateUserId !== userId) ?? '' : hostUserId;

  await runTransaction(firestore, async (transaction) => {
    transaction.delete(membershipDocRef);
    transaction.delete(availabilityDocRef);
    transaction.delete(requestDocRef);

    if (hostUserId === userId) {
      transaction.set(
        settingsDocRef,
        {
          hostUserId: fallbackHostUserId,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    }
  });
}

type SetHostUserIdArgs = {
  campaignId: string;
  userId: string;
};

export async function setCampaignHostUserId({ campaignId, userId }: SetHostUserIdArgs): Promise<void> {
  const settingsRef = getCampaignSettingsDocumentRef(campaignId);
  if (!settingsRef) {
    throw new Error('Firebase is not configured.');
  }

  await setDoc(settingsRef, { hostUserId: userId, updatedAt: serverTimestamp() }, { merge: true });
}
