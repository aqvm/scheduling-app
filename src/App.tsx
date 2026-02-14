import { useEffect, useMemo, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User
} from 'firebase/auth';
import {
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import { auth, db, firebaseConfigError } from './firebase';
import { AdminManagementPage } from './features/admin/AdminManagementPage';
import { SignInPage } from './features/auth/SignInPage';
import { PersonalAvailabilityPage } from './features/availability/PersonalAvailabilityPage';
import { HostSummaryPage } from './features/host/HostSummaryPage';
import { LEGACY_ADMIN_INVITE_CODE, LEGACY_MEMBER_INVITE_CODE } from './shared/scheduler/constants';
import { getMonthDates, isValidMonthValue, toDateKey, toMonthValue } from './shared/scheduler/date';
import {
  getAvailabilityCollectionRef,
  getCampaignInvitesCollectionRef,
  getCampaignSettingsCollectionRef,
  getCampaignSettingsDocumentRef,
  getCampaignsCollectionRef,
  getMembershipsCollectionRef,
  getUsersCollectionRef
} from './shared/scheduler/firebaseRefs';
import { createInviteCode } from './shared/scheduler/invite';
import {
  type AvailabilityByUser,
  type AvailabilityStatus,
  type Campaign,
  type CampaignMembership,
  type UserProfile,
  type UserRole
} from './shared/scheduler/types';
import { isAvailabilityStatus, isUserRole, normalizeInviteCode, normalizeName } from './shared/scheduler/validation';

const MAX_INVITE_CREATE_ATTEMPTS = 6;
const POPUP_REDIRECT_FALLBACK_ERRORS = new Set([
  'auth/cancelled-popup-request',
  'auth/popup-blocked',
  'auth/popup-closed-by-user'
]);

function membershipDocumentId(campaignId: string, userId: string): string {
  return `${campaignId}_${userId}`;
}

function getErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return '';
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : '';
}

function formatFirebaseError(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error) {
    const code = getErrorCode(error);
    return code ? `${error.message} (${code})` : error.message;
  }

  const code = getErrorCode(error);
  return code ? `${fallbackMessage} (${code})` : fallbackMessage;
}

function isSignedInWithGoogle(user: User | null): boolean {
  if (!user) {
    return false;
  }

  return user.providerData.some((provider) => provider.providerId === 'google.com');
}

function getSignedInEmail(user: User | null): string {
  const directEmail = user?.email?.trim().toLowerCase() ?? '';
  if (directEmail) {
    return directEmail;
  }

  const googleProvider = user?.providerData.find((provider) => provider.providerId === 'google.com');
  return googleProvider?.email?.trim().toLowerCase() ?? '';
}

function getUsernameFromEmail(email: string): string {
  const atIndex = email.indexOf('@');
  const localPart = atIndex >= 0 ? email.slice(0, atIndex) : email;
  return normalizeName(localPart);
}

export default function App() {
  const [authUserId, setAuthUserId] = useState('');
  const [authReady, setAuthReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  const [memberships, setMemberships] = useState<CampaignMembership[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [campaignUsers, setCampaignUsers] = useState<UserProfile[]>([]);
  const [campaignAvailability, setCampaignAvailability] = useState<AvailabilityByUser>({});
  const [hostUserId, setHostUserId] = useState('');

  const [selectedMonth, setSelectedMonth] = useState<string>(() => toMonthValue(new Date()));
  const [selectedPaintStatus, setSelectedPaintStatus] = useState<AvailabilityStatus>('available');
  const [pendingEditsByCampaign, setPendingEditsByCampaign] = useState<Record<string, Record<string, AvailabilityStatus>>>({});
  const [isPainting, setIsPainting] = useState(false);
  const [isSavingChanges, setIsSavingChanges] = useState(false);

  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false);
  const [isUpdatingInvite, setIsUpdatingInvite] = useState(false);
  const [isDeletingCampaign, setIsDeletingCampaign] = useState(false);
  const [removingUserId, setRemovingUserId] = useState('');
  const [joinInviteCode, setJoinInviteCode] = useState('');
  const [isJoiningCampaign, setIsJoiningCampaign] = useState(false);
  const [signInError, setSignInError] = useState('');
  const [appError, setAppError] = useState('');
  const [managementError, setManagementError] = useState('');

  const currentUser =
    userProfile !== null && authUserId.length > 0 && userProfile.id === authUserId ? userProfile : null;
  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null;
  const hostUser = campaignUsers.find((user) => user.id === hostUserId) ?? null;
  const canViewHostSummary =
    currentUser !== null &&
    selectedCampaign !== null &&
    (currentUser.role === 'admin' || currentUser.id === hostUserId);

  const currentCampaignPendingEdits =
    selectedCampaignId.length > 0 ? pendingEditsByCampaign[selectedCampaignId] ?? {} : {};
  const hasUnsavedChanges = Object.keys(currentCampaignPendingEdits).length > 0;
  const monthDates = useMemo(() => getMonthDates(selectedMonth), [selectedMonth]);
  const monthDateKeys = useMemo(() => monthDates.map((date) => toDateKey(date)), [monthDates]);

  useEffect(() => {
    if (!auth) {
      setAuthReady(true);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthUserId(user.uid);
        setAuthReady(true);
        return;
      }

      setAuthUserId('');
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!db || !authReady) {
      if (!db) {
        setProfileReady(true);
      }

      return;
    }

    if (!authUserId) {
      setUserProfile(null);
      setProfileReady(true);
      return;
    }

    const usersRef = getUsersCollectionRef();
    if (!usersRef) {
      setUserProfile(null);
      setProfileReady(true);
      return;
    }

    setProfileReady(false);

    const unsubscribe = onSnapshot(
      doc(usersRef, authUserId),
      (docSnapshot) => {
        if (!docSnapshot.exists()) {
          setUserProfile(null);
          setProfileReady(true);
          return;
        }

        const value = docSnapshot.data();
        const name = typeof value.name === 'string' ? normalizeName(value.name) : '';
        const email = typeof value.email === 'string' ? value.email.trim().toLowerCase() : '';
        const role = value.role;

        if (!name || !isUserRole(role)) {
          setUserProfile(null);
          setProfileReady(true);
          return;
        }

        setUserProfile({
          id: docSnapshot.id,
          name,
          role,
          email
        });
        setProfileReady(true);
      },
      () => {
        setUserProfile(null);
        setProfileReady(true);
      }
    );

    return () => unsubscribe();
  }, [authReady, authUserId]);

  useEffect(() => {
    if (!currentUser) {
      setMemberships([]);
      return;
    }

    const membershipsRef = getMembershipsCollectionRef();
    if (!membershipsRef) {
      setMemberships([]);
      return;
    }

    const membershipsQuery = query(
      membershipsRef,
      where('uid', '==', currentUser.id),
      limit(500)
    );

    const unsubscribe = onSnapshot(
      membershipsQuery,
      (snapshot) => {
        const nextMemberships: CampaignMembership[] = [];

        snapshot.forEach((docSnapshot) => {
          const value = docSnapshot.data();
          const campaignId = typeof value.campaignId === 'string' ? value.campaignId : '';
          const userId = typeof value.uid === 'string' ? value.uid : '';
          const name = typeof value.name === 'string' ? normalizeName(value.name) : '';
          const email = typeof value.email === 'string' ? value.email.trim().toLowerCase() : '';

          if (!campaignId || !userId || !name) {
            return;
          }

          nextMemberships.push({
            id: docSnapshot.id,
            campaignId,
            userId,
            name,
            email
          });
        });

        nextMemberships.sort((left, right) => left.campaignId.localeCompare(right.campaignId));
        setMemberships(nextMemberships);
      },
      () => {
        setMemberships([]);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setCampaigns([]);
      return;
    }

    const campaignsRef = getCampaignsCollectionRef();
    if (!campaignsRef) {
      setCampaigns([]);
      return;
    }

    const campaignIds = [...new Set(memberships.map((membership) => membership.campaignId))];
    if (campaignIds.length === 0) {
      setCampaigns([]);
      return;
    }

    const campaignsById = new Map<string, Campaign>();
    setCampaigns([]);

    const unsubscribers = campaignIds.map((campaignId) =>
      onSnapshot(
        doc(campaignsRef, campaignId),
        (docSnapshot) => {
          if (!docSnapshot.exists()) {
            campaignsById.delete(campaignId);
          } else {
            const value = docSnapshot.data();
            const name = typeof value.name === 'string' ? normalizeName(value.name) : '';
            const inviteCode =
              typeof value.inviteCode === 'string' ? normalizeInviteCode(value.inviteCode) : '';
            const inviteEnabled = value.inviteEnabled === true;
            const createdByUid =
              typeof value.createdByUid === 'string' ? value.createdByUid : '';

            if (!name || !inviteCode || !createdByUid) {
              campaignsById.delete(campaignId);
            } else {
              campaignsById.set(campaignId, {
                id: campaignId,
                name,
                inviteCode,
                inviteEnabled,
                createdByUid
              });
            }
          }

          setCampaigns(
            [...campaignsById.values()].sort((left, right) => left.name.localeCompare(right.name))
          );
        },
        () => {
          campaignsById.delete(campaignId);
          setCampaigns(
            [...campaignsById.values()].sort((left, right) => left.name.localeCompare(right.name))
          );
        }
      )
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [currentUser, memberships]);

  useEffect(() => {
    if (campaigns.length === 0) {
      setSelectedCampaignId('');
      return;
    }

    if (!campaigns.some((campaign) => campaign.id === selectedCampaignId)) {
      setSelectedCampaignId(campaigns[0].id);
    }
  }, [campaigns, selectedCampaignId]);

  useEffect(() => {
    if (!selectedCampaignId) {
      setCampaignUsers([]);
      return;
    }

    const membershipsRef = getMembershipsCollectionRef();
    if (!membershipsRef) {
      setCampaignUsers([]);
      return;
    }

    const campaignUsersQuery = query(
      membershipsRef,
      where('campaignId', '==', selectedCampaignId),
      limit(500)
    );

    const unsubscribe = onSnapshot(
      campaignUsersQuery,
      (snapshot) => {
        const users: UserProfile[] = [];

        snapshot.forEach((docSnapshot) => {
          const value = docSnapshot.data();
          const userId = typeof value.uid === 'string' ? value.uid : '';
          const name = typeof value.name === 'string' ? normalizeName(value.name) : '';
          const email = typeof value.email === 'string' ? value.email.trim().toLowerCase() : '';

          if (!userId || !name) {
            return;
          }

          users.push({
            id: userId,
            name,
            email,
            role: 'member'
          });
        });

        users.sort((left, right) => left.name.localeCompare(right.name));
        setCampaignUsers(users);
      },
      () => {
        setCampaignUsers([]);
      }
    );

    return () => unsubscribe();
  }, [selectedCampaignId]);

  useEffect(() => {
    if (!selectedCampaignId) {
      setCampaignAvailability({});
      return;
    }

    const availabilityRef = getAvailabilityCollectionRef();
    if (!availabilityRef) {
      setCampaignAvailability({});
      return;
    }

    const availabilityQuery = query(
      availabilityRef,
      where('campaignId', '==', selectedCampaignId),
      limit(1000)
    );

    const unsubscribe = onSnapshot(
      availabilityQuery,
      (snapshot) => {
        const availability: AvailabilityByUser = {};

        snapshot.forEach((docSnapshot) => {
          const raw = docSnapshot.data();
          const daysRaw = raw.days;
          const userId = typeof raw.uid === 'string' ? raw.uid : '';

          if (!userId) {
            return;
          }

          if (!daysRaw || typeof daysRaw !== 'object') {
            availability[userId] = {};
            return;
          }

          const days: Record<string, AvailabilityStatus> = {};
          for (const [dateKey, statusValue] of Object.entries(daysRaw as Record<string, unknown>)) {
            if (isAvailabilityStatus(statusValue)) {
              days[dateKey] = statusValue;
            }
          }

          availability[userId] = days;
        });

        setCampaignAvailability(availability);
      },
      () => {
        setCampaignAvailability({});
      }
    );

    return () => unsubscribe();
  }, [selectedCampaignId]);

  useEffect(() => {
    if (!selectedCampaignId) {
      setHostUserId('');
      return;
    }

    const settingsDocRef = getCampaignSettingsDocumentRef(selectedCampaignId);
    if (!settingsDocRef) {
      setHostUserId('');
      return;
    }

    const unsubscribe = onSnapshot(
      settingsDocRef,
      (docSnapshot) => {
        const value = docSnapshot.data();
        const nextHostUserId = typeof value?.hostUserId === 'string' ? value.hostUserId : '';
        setHostUserId(nextHostUserId);
      },
      () => {
        setHostUserId('');
      }
    );

    return () => unsubscribe();
  }, [selectedCampaignId]);

  useEffect(() => {
    const onMouseUp = () => setIsPainting(false);
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, []);

  useEffect(() => {
    if (!currentUser || !selectedCampaignId) {
      return;
    }

    const userPending = pendingEditsByCampaign[selectedCampaignId];
    if (!userPending || Object.keys(userPending).length === 0) {
      return;
    }

    const userServerDays = campaignAvailability[currentUser.id] ?? {};
    const nextPending: Record<string, AvailabilityStatus> = {};

    for (const [dateKey, status] of Object.entries(userPending)) {
      const serverStatus = userServerDays[dateKey] ?? 'unspecified';
      if (serverStatus !== status) {
        nextPending[dateKey] = status;
      }
    }

    const pendingEntries = Object.entries(userPending);
    const nextEntries = Object.entries(nextPending);
    const isEqual =
      pendingEntries.length === nextEntries.length &&
      pendingEntries.every(([dateKey, status]) => nextPending[dateKey] === status);

    if (isEqual) {
      return;
    }

    setPendingEditsByCampaign((current) => {
      if (Object.keys(nextPending).length === 0) {
        const { [selectedCampaignId]: _removed, ...rest } = current;
        return rest;
      }

      return {
        ...current,
        [selectedCampaignId]: nextPending
      };
    });
  }, [campaignAvailability, currentUser, pendingEditsByCampaign, selectedCampaignId]);

  const getStatus = (userId: string, dateKey: string): AvailabilityStatus => {
    if (currentUser && selectedCampaignId && userId === currentUser.id) {
      const pendingStatus = pendingEditsByCampaign[selectedCampaignId]?.[dateKey];
      if (pendingStatus) {
        return pendingStatus;
      }
    }

    return campaignAvailability[userId]?.[dateKey] ?? 'unspecified';
  };

  const paintDate = (dateKey: string): void => {
    if (!currentUser || !selectedCampaignId) {
      return;
    }

    const serverStatus = campaignAvailability[currentUser.id]?.[dateKey] ?? 'unspecified';
    const nextStatus = selectedPaintStatus;

    setPendingEditsByCampaign((current) => {
      const campaignPending = current[selectedCampaignId] ?? {};
      const nextPending = { ...campaignPending };

      if (nextStatus === serverStatus) {
        delete nextPending[dateKey];
      } else {
        nextPending[dateKey] = nextStatus;
      }

      if (Object.keys(nextPending).length === 0) {
        const { [selectedCampaignId]: _removed, ...rest } = current;
        return rest;
      }

      return {
        ...current,
        [selectedCampaignId]: nextPending
      };
    });
  };

  const onStartPaint = (dateKey: string): void => {
    setIsPainting(true);
    paintDate(dateKey);
  };

  const onPaintWhileDragging = (dateKey: string): void => {
    if (!isPainting) {
      return;
    }

    paintDate(dateKey);
  };

  const onSaveChanges = (): void => {
    if (!currentUser || !selectedCampaignId || isSavingChanges) {
      return;
    }

    const userPendingEdits = pendingEditsByCampaign[selectedCampaignId];
    if (!userPendingEdits || Object.keys(userPendingEdits).length === 0) {
      return;
    }

    const availabilityRef = getAvailabilityCollectionRef();
    if (!availabilityRef) {
      setAppError('Firebase is not configured.');
      return;
    }

    const nextDays = {
      ...(campaignAvailability[currentUser.id] ?? {}),
      ...userPendingEdits
    };

    setIsSavingChanges(true);
    setAppError('');

    void setDoc(
      doc(availabilityRef, membershipDocumentId(selectedCampaignId, currentUser.id)),
      {
        campaignId: selectedCampaignId,
        uid: currentUser.id,
        days: nextDays,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    )
      .then(() => {
        setPendingEditsByCampaign((current) => {
          const { [selectedCampaignId]: _removed, ...rest } = current;
          return rest;
        });
      })
      .catch(() => {
        setAppError('Unable to save availability changes.');
      })
      .finally(() => {
        setIsSavingChanges(false);
      });
  };

  const onJoinCampaign = (inviteCodeInput: string): void => {
    const inviteCode = normalizeInviteCode(inviteCodeInput);
    const authUser = auth?.currentUser ?? null;
    const signedInUserId = authUser?.uid ?? authUserId;
    const signedInEmail = getSignedInEmail(authUser);

    if (!signedInUserId) {
      setSignInError('Sign in with Google first.');
      return;
    }

    if (!isSignedInWithGoogle(authUser)) {
      setSignInError('Google sign-in session is missing. Please continue with Google again.');
      return;
    }

    if (!signedInEmail) {
      setSignInError(
        'Unable to confirm your Google account email. Try a Google account with an available email address.'
      );
      return;
    }

    const username = getUsernameFromEmail(signedInEmail);
    if (!username) {
      setSignInError('Unable to derive a username from your Google account email.');
      return;
    }

    if (!db) {
      setSignInError('Firebase is not configured.');
      return;
    }

    if (!inviteCode) {
      setSignInError('Campaign invite code is required to join a campaign.');
      return;
    }

    const usersRef = getUsersCollectionRef();
    const invitesRef = getCampaignInvitesCollectionRef();
    const membershipsRef = getMembershipsCollectionRef();
    const settingsRef = getCampaignSettingsCollectionRef();
    if (!usersRef || !invitesRef || !membershipsRef || !settingsRef) {
      setSignInError('Firebase is not configured.');
      return;
    }

    const userDocRef = doc(usersRef, signedInUserId);

    setSignInError('');
    setIsJoiningCampaign(true);

    void runTransaction(db, async (transaction) => {
      const userSnapshot = await transaction.get(userDocRef);
      let inviteCampaignId = '';
      let roleForNewUser: UserRole = 'member';

      const inviteDocRef = doc(invitesRef, inviteCode);
      const inviteSnapshot = await transaction.get(inviteDocRef);

      if (inviteSnapshot.exists()) {
        const inviteValue = inviteSnapshot.data();
        const campaignId =
          typeof inviteValue.campaignId === 'string' ? inviteValue.campaignId : '';
        const enabled = inviteValue.enabled === true;

        if (!campaignId) {
          throw new Error('Invite code is misconfigured.');
        }

        const membershipDocRef = doc(
          membershipsRef,
          membershipDocumentId(campaignId, signedInUserId)
        );
        const membershipSnapshot = await transaction.get(membershipDocRef);

        if (!enabled && !membershipSnapshot.exists()) {
          throw new Error('This invite code is disabled.');
        }

        inviteCampaignId = campaignId;
        transaction.set(
          membershipDocRef,
          {
            campaignId,
            uid: signedInUserId,
            name: username,
            email: signedInEmail,
            joinedAt: serverTimestamp(),
            lastSeenAt: serverTimestamp()
          },
          { merge: true }
        );

        const campaignSettingsDocRef = doc(settingsRef, campaignId);
        const settingsSnapshot = await transaction.get(campaignSettingsDocRef);
        const hostForCampaign =
          typeof settingsSnapshot.data()?.hostUserId === 'string'
            ? settingsSnapshot.data()?.hostUserId
            : '';

        if (!hostForCampaign) {
          transaction.set(
            campaignSettingsDocRef,
            { hostUserId: signedInUserId, updatedAt: serverTimestamp() },
            { merge: true }
          );
        }
      } else if (inviteCode === normalizeInviteCode(LEGACY_ADMIN_INVITE_CODE)) {
        roleForNewUser = 'admin';
      } else if (inviteCode === normalizeInviteCode(LEGACY_MEMBER_INVITE_CODE)) {
        roleForNewUser = 'member';
      } else {
        throw new Error('Invalid invite code.');
      }

      if (userSnapshot.exists()) {
        const existingRole = userSnapshot.data().role;
        if (!isUserRole(existingRole)) {
          throw new Error('Profile role is invalid.');
        }

        transaction.set(
          userDocRef,
          {
            name: username,
            email: signedInEmail,
            role: existingRole,
            lastSeenAt: serverTimestamp()
          },
          { merge: true }
        );
      } else {
        transaction.set(
          userDocRef,
          {
            name: username,
            email: signedInEmail,
            role: roleForNewUser,
            createdAt: serverTimestamp(),
            lastSeenAt: serverTimestamp()
          },
          { merge: true }
        );
      }

      return inviteCampaignId;
    })
      .then((inviteCampaignId) => {
        if (inviteCampaignId) {
          setSelectedCampaignId(inviteCampaignId);
        }

        setJoinInviteCode('');
        setSignInError('');
        setAppError('');
      })
      .catch((error: unknown) => {
        setSignInError(formatFirebaseError(error, 'Unable to join campaign at this time.'));
      })
      .finally(() => {
        setIsJoiningCampaign(false);
      });
  };

  const onGoogleSignIn = (): void => {
    const firebaseAuth = auth;
    if (!firebaseAuth || isGoogleSigningIn) {
      return;
    }

    setIsGoogleSigningIn(true);
    setSignInError('');

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    void signInWithPopup(firebaseAuth, provider)
      .catch((error: unknown) => {
        const errorCode = getErrorCode(error);
        if (POPUP_REDIRECT_FALLBACK_ERRORS.has(errorCode)) {
          setSignInError('Popup sign-in failed. Trying redirect sign-in...');

          return signInWithRedirect(firebaseAuth, provider).catch((redirectError: unknown) => {
            setSignInError(formatFirebaseError(redirectError, 'Unable to sign in with Google right now.'));
          });
        }

        setSignInError(formatFirebaseError(error, 'Unable to sign in with Google right now.'));
      })
      .finally(() => {
        setIsGoogleSigningIn(false);
      });
  };

  const onCreateCampaign = (campaignNameInput: string): void => {
    const campaignName = normalizeName(campaignNameInput);

    if (!currentUser || currentUser.role !== 'admin') {
      return;
    }

    if (!campaignName) {
      setManagementError('Campaign name is required.');
      return;
    }

    if (!db) {
      setManagementError('Firebase is not configured.');
      return;
    }
    const firestore = db;

    const campaignsRef = getCampaignsCollectionRef();
    const invitesRef = getCampaignInvitesCollectionRef();
    const membershipsRef = getMembershipsCollectionRef();
    const settingsRef = getCampaignSettingsCollectionRef();
    if (!campaignsRef || !invitesRef || !membershipsRef || !settingsRef) {
      setManagementError('Firebase is not configured.');
      return;
    }

    setManagementError('');
    setIsCreatingCampaign(true);

    const createAttempt = async (): Promise<string> => {
      for (let attempt = 0; attempt < MAX_INVITE_CREATE_ATTEMPTS; attempt += 1) {
        const inviteCode = normalizeInviteCode(createInviteCode());
        const campaignDocRef = doc(campaignsRef);
        const inviteDocRef = doc(invitesRef, inviteCode);
        const membershipDocRef = doc(
          membershipsRef,
          membershipDocumentId(campaignDocRef.id, currentUser.id)
        );
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
              createdByUid: currentUser.id,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
            transaction.set(inviteDocRef, {
              campaignId: campaignDocRef.id,
              enabled: true,
              createdByUid: currentUser.id,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
            transaction.set(
              membershipDocRef,
              {
                campaignId: campaignDocRef.id,
                uid: currentUser.id,
                name: currentUser.name,
                email: currentUser.email,
                joinedAt: serverTimestamp(),
                lastSeenAt: serverTimestamp()
              },
              { merge: true }
            );
            transaction.set(
              campaignSettingsDocRef,
              {
                hostUserId: currentUser.id,
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
    };

    void createAttempt()
      .then((campaignId) => {
        setSelectedCampaignId(campaignId);
      })
      .catch((error: unknown) => {
        if (error instanceof Error) {
          setManagementError(error.message);
          return;
        }

        setManagementError('Unable to create campaign.');
      })
      .finally(() => {
        setIsCreatingCampaign(false);
      });
  };

  const onSetInviteEnabled = (enabled: boolean): void => {
    if (!currentUser || currentUser.role !== 'admin' || !selectedCampaign) {
      return;
    }

    if (!db) {
      setManagementError('Firebase is not configured.');
      return;
    }
    const firestore = db;

    const campaignsRef = getCampaignsCollectionRef();
    const invitesRef = getCampaignInvitesCollectionRef();
    if (!campaignsRef || !invitesRef) {
      setManagementError('Firebase is not configured.');
      return;
    }

    setManagementError('');
    setIsUpdatingInvite(true);

    const campaignDocRef = doc(campaignsRef, selectedCampaign.id);
    const inviteDocRef = doc(invitesRef, selectedCampaign.inviteCode);

    void runTransaction(db, async (transaction) => {
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
    })
      .catch((error: unknown) => {
        if (error instanceof Error) {
          setManagementError(error.message);
          return;
        }

        setManagementError('Unable to update invite code state.');
      })
      .finally(() => {
        setIsUpdatingInvite(false);
      });
  };

  const onDeleteCampaign = (): void => {
    if (!currentUser || currentUser.role !== 'admin' || !selectedCampaign || isDeletingCampaign) {
      return;
    }

    if (!db) {
      setManagementError('Firebase is not configured.');
      return;
    }
    const firestore = db;

    const campaignsRef = getCampaignsCollectionRef();
    const invitesRef = getCampaignInvitesCollectionRef();
    const membershipsRef = getMembershipsCollectionRef();
    const availabilityRef = getAvailabilityCollectionRef();
    const campaignToDelete = selectedCampaign;
    const settingsDocRef = getCampaignSettingsDocumentRef(campaignToDelete.id);
    if (!campaignsRef || !invitesRef || !membershipsRef || !availabilityRef || !settingsDocRef) {
      setManagementError('Firebase is not configured.');
      return;
    }

    setManagementError('');
    setIsDeletingCampaign(true);

    const campaignDocRef = doc(campaignsRef, campaignToDelete.id);
    const inviteDocRef = doc(invitesRef, campaignToDelete.inviteCode);
    const membershipsQuery = query(membershipsRef, where('campaignId', '==', campaignToDelete.id));
    const availabilityQuery = query(availabilityRef, where('campaignId', '==', campaignToDelete.id));

    void Promise.all([getDocs(membershipsQuery), getDocs(availabilityQuery)])
      .then(async ([membershipsSnapshot, availabilitySnapshot]) => {
        const docsToDelete = [
          campaignDocRef,
          inviteDocRef,
          settingsDocRef,
          ...membershipsSnapshot.docs.map((membershipDoc) => membershipDoc.ref),
          ...availabilitySnapshot.docs.map((availabilityDoc) => availabilityDoc.ref)
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
      })
      .then(() => {
        if (selectedCampaignId === campaignToDelete.id) {
          setSelectedCampaignId('');
        }
      })
      .catch((error: unknown) => {
        setManagementError(formatFirebaseError(error, 'Unable to delete campaign.'));
      })
      .finally(() => {
        setIsDeletingCampaign(false);
      });
  };

  const onKickUser = (userId: string): void => {
    if (!currentUser || currentUser.role !== 'admin' || !selectedCampaign || userId === currentUser.id) {
      return;
    }

    if (!db) {
      setManagementError('Firebase is not configured.');
      return;
    }

    const membershipsRef = getMembershipsCollectionRef();
    const availabilityRef = getAvailabilityCollectionRef();
    const settingsDocRef = getCampaignSettingsDocumentRef(selectedCampaign.id);
    if (!membershipsRef || !availabilityRef || !settingsDocRef) {
      setManagementError('Firebase is not configured.');
      return;
    }

    setManagementError('');
    setRemovingUserId(userId);

    const membershipDocRef = doc(
      membershipsRef,
      membershipDocumentId(selectedCampaign.id, userId)
    );
    const availabilityDocRef = doc(
      availabilityRef,
      membershipDocumentId(selectedCampaign.id, userId)
    );
    const fallbackHostUserId =
      hostUserId === userId ? campaignUsers.find((user) => user.id !== userId)?.id ?? '' : hostUserId;

    void runTransaction(db, async (transaction) => {
      transaction.delete(membershipDocRef);
      transaction.delete(availabilityDocRef);

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
    })
      .catch((error: unknown) => {
        if (error instanceof Error) {
          setManagementError(error.message);
          return;
        }

        setManagementError('Unable to remove campaign user.');
      })
      .finally(() => {
        setRemovingUserId('');
      });
  };

  const onSetHostUserId = (userId: string): void => {
    if (!currentUser || currentUser.role !== 'admin' || !selectedCampaign) {
      return;
    }

    const settingsRef = getCampaignSettingsDocumentRef(selectedCampaign.id);
    if (!settingsRef || !campaignUsers.some((user) => user.id === userId)) {
      return;
    }

    setHostUserId(userId);

    void setDoc(settingsRef, { hostUserId: userId, updatedAt: serverTimestamp() }, { merge: true }).catch(() => {
      setAppError('Unable to update host assignment.');
    });
  };

  const onSignOut = (): void => {
    setUserProfile(null);
    setMemberships([]);
    setCampaigns([]);
    setSelectedCampaignId('');
    setCampaignUsers([]);
    setCampaignAvailability({});
    setHostUserId('');
    setJoinInviteCode('');
    setIsJoiningCampaign(false);
    setManagementError('');
    setSignInError('');
    setAppError('');
    setIsPainting(false);
    setPendingEditsByCampaign({});
    setIsSavingChanges(false);

    if (!auth) {
      return;
    }

    void signOut(auth).catch(() => {
      setAppError('Unable to sign out cleanly.');
    });
  };

  const onChangeMonth = (nextValue: string): void => {
    setSelectedMonth(isValidMonthValue(nextValue) ? nextValue : toMonthValue(new Date()));
  };

  if (firebaseConfigError) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <h1>DnD Group Scheduler</h1>
          <p>Firebase setup is required for shared state.</p>
        </header>
        <main>
          <section className="page-card sign-in-card">
            <h2>Missing Firebase Config</h2>
            <p>{firebaseConfigError}</p>
          </section>
        </main>
      </div>
    );
  }

  if (!authReady || (authUserId && !profileReady)) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <h1>DnD Group Scheduler</h1>
          <p>Connecting to shared schedule data...</p>
        </header>
      </div>
    );
  }

  if (!authUserId) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <h1>DnD Group Scheduler</h1>
          <p>Invite-only scheduling board for your party.</p>
        </header>
        <main>
          <SignInPage
            onGoogleSignIn={onGoogleSignIn}
            isGoogleSigningIn={isGoogleSigningIn}
            error={signInError}
          />
        </main>
      </div>
    );
  }

  const signedInName = getUsernameFromEmail(getSignedInEmail(auth?.currentUser ?? null)) || 'Unknown';

  const campaignSelectionControl = (
    <label className="month-picker" htmlFor="campaign-select">
      Campaign
      <select
        id="campaign-select"
        value={selectedCampaignId}
        onChange={(event) => setSelectedCampaignId(event.target.value)}
        disabled={campaigns.length === 0}
      >
        {campaigns.length === 0 ? (
          <option value="">No Campaigns</option>
        ) : (
          campaigns.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>
              {campaign.name}
            </option>
          ))
        )}
      </select>
    </label>
  );

  const joinCampaignControl = (
    <form
      className="join-campaign-form"
      onSubmit={(event) => {
        event.preventDefault();
        onJoinCampaign(joinInviteCode);
      }}
    >
      <label className="month-picker" htmlFor="join-campaign-code-input">
        Join Campaign
        <input
          id="join-campaign-code-input"
          type="text"
          value={joinInviteCode}
          onChange={(event) => {
            setJoinInviteCode(event.target.value);
            if (signInError) {
              setSignInError('');
            }
          }}
          autoComplete="off"
          spellCheck={false}
          placeholder="XXXX-XXXX-XXXX"
          maxLength={32}
        />
      </label>
      <button type="submit" className="primary-button" disabled={isJoiningCampaign}>
        {isJoiningCampaign ? 'Joining...' : 'Join'}
      </button>
    </form>
  );

  if (!currentUser) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <h1>DnD Group Scheduler</h1>
          <p>Signed in as <strong>{signedInName}</strong>. Join a campaign to continue.</p>
          <div className="header-controls">
            {campaignSelectionControl}
            {joinCampaignControl}
            <button type="button" className="ghost-button sign-out-button" onClick={onSignOut}>
              Sign Out
            </button>
          </div>
          {signInError ? <p className="form-error">{signInError}</p> : null}
          {appError ? <p className="form-error">{appError}</p> : null}
        </header>
        <main>
          <section className="page-card">
            <h2>Join a Campaign</h2>
            <p>Use the invite code field above to join your first or next campaign.</p>
          </section>
        </main>
      </div>
    );
  }

  const personalAvailabilityPageProps = {
    currentUser,
    monthDates,
    monthValue: selectedMonth,
    setMonthValue: onChangeMonth,
    paintStatus: selectedPaintStatus,
    setPaintStatus: setSelectedPaintStatus,
    getStatus,
    onStartPaint,
    onPaintWhileDragging,
    onPaintDate: paintDate,
    hasUnsavedChanges,
    isSaving: isSavingChanges,
    onSaveChanges
  };

  const noCampaignSelectedView = (
    <section className="page-card">
      <h2>No Campaign Selected</h2>
      <p>
        Join a campaign with the invite code field above, or create one from Campaign Management if
        you are an admin.
      </p>
    </section>
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>DnD Group Scheduler</h1>
        <p>
          Signed in as <strong>{currentUser.name}</strong> ({currentUser.role}). Campaign:{' '}
          <strong>{selectedCampaign?.name ?? 'None selected'}</strong>. Host:{' '}
          <strong>{hostUser?.name ?? 'Not set'}</strong>
        </p>
        <div className="header-controls">
          {campaignSelectionControl}
          {joinCampaignControl}
          <button type="button" className="ghost-button sign-out-button" onClick={onSignOut}>
            Sign Out
          </button>
        </div>
        {signInError ? <p className="form-error">{signInError}</p> : null}
        {appError ? <p className="form-error">{appError}</p> : null}
      </header>

      <nav className="top-nav" aria-label="Primary">
        <NavLink to="/" end>
          My Availability
        </NavLink>
        {canViewHostSummary ? <NavLink to="/host">Host Summary</NavLink> : null}
        {currentUser.role === 'admin' ? <NavLink to="/admin">Campaign Management</NavLink> : null}
      </nav>

      <main>
        <Routes>
          <Route
            path="/"
            element={
              selectedCampaign ? (
                <PersonalAvailabilityPage {...personalAvailabilityPageProps} />
              ) : (
                noCampaignSelectedView
              )
            }
          />
          <Route
            path="/host"
            element={
              canViewHostSummary && selectedCampaign ? (
                <HostSummaryPage
                  users={campaignUsers}
                  currentUser={currentUser}
                  hostUserId={hostUserId}
                  monthDateKeys={monthDateKeys}
                  getStatus={getStatus}
                />
              ) : selectedCampaign ? (
                <PersonalAvailabilityPage {...personalAvailabilityPageProps} />
              ) : (
                noCampaignSelectedView
              )
            }
          />
          <Route
            path="/admin"
            element={
              <AdminManagementPage
                currentUser={currentUser}
                selectedCampaign={selectedCampaign}
                users={campaignUsers}
                hostUserId={hostUserId}
                setHostUserId={onSetHostUserId}
                managementError={managementError}
                isCreatingCampaign={isCreatingCampaign}
                isUpdatingInvite={isUpdatingInvite}
                isDeletingCampaign={isDeletingCampaign}
                removingUserId={removingUserId}
                onCreateCampaign={onCreateCampaign}
                onSetInviteEnabled={onSetInviteEnabled}
                onDeleteCampaign={onDeleteCampaign}
                onKickUser={onKickUser}
              />
            }
          />
          <Route
            path="*"
            element={
              selectedCampaign ? (
                <PersonalAvailabilityPage {...personalAvailabilityPageProps} />
              ) : (
                noCampaignSelectedView
              )
            }
          />
        </Routes>
      </main>
    </div>
  );
}
