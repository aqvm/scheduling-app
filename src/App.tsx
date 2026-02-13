import { useEffect, useMemo, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, limit, onSnapshot, query, runTransaction, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { auth, db, firebaseConfigError } from './firebase';
import { AdminManagementPage } from './features/admin/AdminManagementPage';
import { SignInPage } from './features/auth/SignInPage';
import { PersonalAvailabilityPage } from './features/availability/PersonalAvailabilityPage';
import { HostSummaryPage } from './features/host/HostSummaryPage';
import {
  APP_NAMESPACE,
  LEGACY_ADMIN_INVITE_CODE,
  LEGACY_MEMBER_INVITE_CODE
} from './shared/scheduler/constants';
import { getMonthDates, isValidMonthValue, toDateKey, toMonthValue } from './shared/scheduler/date';
import {
  getAvailabilityCollectionRef,
  getCampaignInvitesCollectionRef,
  getSettingsDocumentRef,
  getUsersCollectionRef
} from './shared/scheduler/firebaseRefs';
import { createInviteCode } from './shared/scheduler/invite';
import {
  INITIAL_PERSISTED_STATE,
  type AvailabilityByUser,
  type AvailabilityStatus,
  type CampaignInvite,
  type PendingEditsByUser,
  type PersistedState,
  type UserRole
} from './shared/scheduler/types';
import { isAvailabilityStatus, isUserRole, normalizeInviteCode, normalizeName } from './shared/scheduler/validation';

/**
 * Root application component.
 *
 * Responsibilities:
 * - coordinate auth and Firestore subscriptions
 * - manage local unsaved calendar edits
 * - expose action handlers to feature pages
 * - route between availability, host, and admin views
 */
export default function App() {
  /**
   * Snapshot-backed campaign state.
   */
  const [state, setState] = useState<PersistedState>(INITIAL_PERSISTED_STATE);

  /**
   * Local unsaved edits per user/day.
   */
  const [pendingEdits, setPendingEdits] = useState<PendingEditsByUser>({});

  /**
   * `authUserId` tracks current Firebase Auth session.
   * `sessionUserId` tracks app-level signed-in profile after invite validation.
   */
  const [authUserId, setAuthUserId] = useState('');
  const [sessionUserId, setSessionUserId] = useState('');

  /**
   * Readiness flags used for loading states.
   */
  const [authReady, setAuthReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);

  /**
   * Calendar UI controls.
   */
  const [selectedMonth, setSelectedMonth] = useState<string>(() => toMonthValue(new Date()));
  const [selectedPaintStatus, setSelectedPaintStatus] = useState<AvailabilityStatus>('available');

  /**
   * Request and interaction flags.
   */
  const [isSavingChanges, setIsSavingChanges] = useState(false);
  const [isPainting, setIsPainting] = useState(false);
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);

  /**
   * Admin invite state.
   */
  const [invites, setInvites] = useState<CampaignInvite[]>([]);
  const [latestInviteCode, setLatestInviteCode] = useState('');
  const [inviteError, setInviteError] = useState('');

  /**
   * UI errors surfaced to users.
   */
  const [signInError, setSignInError] = useState('');
  const [appError, setAppError] = useState('');

  /**
   * Derived identity and view permissions.
   */
  const currentUser = state.users.find((user) => user.id === sessionUserId) ?? null;
  const hostUser = state.users.find((user) => user.id === state.hostUserId) ?? null;
  const canViewHostSummary =
    currentUser !== null && (currentUser.role === 'admin' || currentUser.id === state.hostUserId);

  /**
   * Derived edit/read models for current month.
   */
  const currentUserPendingEdits = currentUser ? pendingEdits[currentUser.id] ?? {} : {};
  const hasUnsavedChanges = Object.keys(currentUserPendingEdits).length > 0;
  const monthDates = useMemo(() => getMonthDates(selectedMonth), [selectedMonth]);
  const monthDateKeys = useMemo(() => monthDates.map((date) => toDateKey(date)), [monthDates]);

  /**
   * Listen to Firebase Auth session changes.
   */
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
      setSessionUserId('');
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  /**
   * Subscribe to campaign datasets once auth is ready.
   * We intentionally gate `dataReady` until all three snapshot streams report once.
   */
  useEffect(() => {
    if (!db || !authReady) {
      if (!db) {
        setDataReady(true);
      }

      return;
    }

    if (!authUserId) {
      setState(INITIAL_PERSISTED_STATE);
      setDataReady(true);
      return;
    }

    const usersRef = getUsersCollectionRef();
    const availabilityRef = getAvailabilityCollectionRef();
    const settingsRef = getSettingsDocumentRef();

    if (!usersRef || !availabilityRef || !settingsRef) {
      setDataReady(true);
      return;
    }

    setDataReady(false);

    let usersLoaded = false;
    let availabilityLoaded = false;
    let settingsLoaded = false;

    const maybeMarkReady = (): void => {
      if (usersLoaded && availabilityLoaded && settingsLoaded) {
        setDataReady(true);
      }
    };

    const unsubscribeUsers = onSnapshot(
      usersRef,
      (snapshot) => {
        const users = snapshot.docs
          .map((docSnapshot) => {
            const value = docSnapshot.data();
            const name = typeof value.name === 'string' ? normalizeName(value.name) : '';
            const email = typeof value.email === 'string' ? value.email.trim().toLowerCase() : '';
            const role = value.role;

            if (!name || !isUserRole(role)) {
              return null;
            }

            return {
              id: docSnapshot.id,
              name,
              role,
              email
            };
          })
          .filter((user): user is NonNullable<typeof user> => user !== null);

        setState((current) => ({
          ...current,
          users: users.sort((left, right) => left.name.localeCompare(right.name))
        }));
        usersLoaded = true;
        maybeMarkReady();
      },
      () => {
        usersLoaded = true;
        maybeMarkReady();
      }
    );

    const unsubscribeAvailability = onSnapshot(
      availabilityRef,
      (snapshot) => {
        const availability: AvailabilityByUser = {};

        snapshot.forEach((docSnapshot) => {
          const raw = docSnapshot.data();
          const daysRaw = raw.days;

          if (!daysRaw || typeof daysRaw !== 'object') {
            availability[docSnapshot.id] = {};
            return;
          }

          const days: Record<string, AvailabilityStatus> = {};
          for (const [dateKey, statusValue] of Object.entries(daysRaw as Record<string, unknown>)) {
            if (isAvailabilityStatus(statusValue)) {
              days[dateKey] = statusValue;
            }
          }

          availability[docSnapshot.id] = days;
        });

        setState((current) => ({
          ...current,
          availability
        }));
        availabilityLoaded = true;
        maybeMarkReady();
      },
      () => {
        availabilityLoaded = true;
        maybeMarkReady();
      }
    );

    const unsubscribeSettings = onSnapshot(
      settingsRef,
      (docSnapshot) => {
        const value = docSnapshot.data();
        const hostUserId = typeof value?.hostUserId === 'string' ? value.hostUserId : '';

        setState((current) => ({
          ...current,
          hostUserId
        }));
        settingsLoaded = true;
        maybeMarkReady();
      },
      () => {
        settingsLoaded = true;
        maybeMarkReady();
      }
    );

    return () => {
      unsubscribeUsers();
      unsubscribeAvailability();
      unsubscribeSettings();
    };
  }, [authReady, authUserId]);

  /**
   * Auto-establish app session when auth user already exists in campaign users.
   */
  useEffect(() => {
    if (!authUserId) {
      setSessionUserId('');
      return;
    }

    if (state.users.some((user) => user.id === authUserId)) {
      setSessionUserId(authUserId);
    }
  }, [authUserId, state.users]);

  /**
   * Subscribe admin users to invite documents.
   */
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'admin') {
      setInvites([]);
      return;
    }

    const invitesRef = getCampaignInvitesCollectionRef();
    if (!invitesRef) {
      setInvites([]);
      return;
    }

    const invitesQuery = query(invitesRef, where('campaignId', '==', APP_NAMESPACE), limit(100));
    const unsubscribe = onSnapshot(
      invitesQuery,
      (snapshot) => {
        const nextInvites: CampaignInvite[] = [];

        snapshot.forEach((docSnapshot) => {
          const value = docSnapshot.data();
          const campaignId = typeof value.campaignId === 'string' ? value.campaignId : '';
          const role = value.role;
          const createdByUid = typeof value.createdByUid === 'string' ? value.createdByUid : '';
          const redeemedByUid = typeof value.redeemedByUid === 'string' ? value.redeemedByUid : '';
          const revoked = value.revoked === true;

          if (!campaignId || !createdByUid || !isUserRole(role)) {
            return;
          }

          nextInvites.push({
            code: docSnapshot.id,
            campaignId,
            role,
            createdByUid,
            redeemedByUid,
            revoked
          });
        });

        nextInvites.sort((left, right) => right.code.localeCompare(left.code));
        setInvites(nextInvites);
      },
      () => {
        setInvites([]);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  /**
   * End drag-paint mode on global mouse release.
   */
  useEffect(() => {
    const onMouseUp = () => setIsPainting(false);
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, []);

  /**
   * Reconcile pending edits whenever server state updates.
   * If the server already matches a pending value, we remove that pending entry.
   */
  useEffect(() => {
    if (!currentUser) {
      return;
    }

    const userId = currentUser.id;
    const userPending = pendingEdits[userId];
    if (!userPending || Object.keys(userPending).length === 0) {
      return;
    }

    const userServerDays = state.availability[userId] ?? {};
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

    setPendingEdits((current) => {
      if (Object.keys(nextPending).length === 0) {
        const { [userId]: _removed, ...rest } = current;
        return rest;
      }

      return {
        ...current,
        [userId]: nextPending
      };
    });
  }, [currentUser, pendingEdits, state.availability]);

  /**
   * Initialize host to first known user when no host is set yet.
   */
  useEffect(() => {
    const settingsRef = getSettingsDocumentRef();
    if (!settingsRef || state.users.length === 0 || state.hostUserId) {
      return;
    }

    void setDoc(settingsRef, { hostUserId: state.users[0].id, updatedAt: serverTimestamp() }, { merge: true });
  }, [state.users, state.hostUserId]);

  /**
   * Returns effective status for rendering: pending edit overrides persisted value.
   */
  const getStatus = (userId: string, dateKey: string): AvailabilityStatus => {
    const pendingStatus = pendingEdits[userId]?.[dateKey];
    if (pendingStatus) {
      return pendingStatus;
    }

    return state.availability[userId]?.[dateKey] ?? 'unspecified';
  };

  /**
   * Updates local pending edits for one date.
   */
  const paintDate = (dateKey: string): void => {
    if (!currentUser) {
      return;
    }

    const currentUserId = currentUser.id;
    const serverStatus = state.availability[currentUserId]?.[dateKey] ?? 'unspecified';
    const nextStatus = selectedPaintStatus;

    setPendingEdits((current) => {
      const userPending = current[currentUserId] ?? {};
      const nextPending = { ...userPending };

      if (nextStatus === serverStatus) {
        // Editing to the server value means there is no local delta to save.
        delete nextPending[dateKey];
      } else {
        nextPending[dateKey] = nextStatus;
      }

      if (Object.keys(nextPending).length === 0) {
        const { [currentUserId]: _removed, ...rest } = current;
        return rest;
      }

      return {
        ...current,
        [currentUserId]: nextPending
      };
    });
  };

  /**
   * Starts drag painting at the clicked cell.
   */
  const onStartPaint = (dateKey: string): void => {
    setIsPainting(true);
    paintDate(dateKey);
  };

  /**
   * Continues drag painting as the cursor enters additional cells.
   */
  const onPaintWhileDragging = (dateKey: string): void => {
    if (!isPainting) {
      return;
    }

    paintDate(dateKey);
  };

  /**
   * Persists current user's pending day edits.
   */
  const onSaveChanges = (): void => {
    if (!currentUser || isSavingChanges) {
      return;
    }

    const userPendingEdits = pendingEdits[currentUser.id];
    if (!userPendingEdits || Object.keys(userPendingEdits).length === 0) {
      return;
    }

    const availabilityRef = getAvailabilityCollectionRef();
    if (!availabilityRef) {
      setAppError('Firebase is not configured.');
      return;
    }

    const nextDays = {
      ...(state.availability[currentUser.id] ?? {}),
      ...userPendingEdits
    };

    setIsSavingChanges(true);
    setAppError('');

    void setDoc(
      doc(availabilityRef, currentUser.id),
      {
        days: nextDays,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    )
      .then(() => {
        setPendingEdits((current) => {
          const { [currentUser.id]: _removed, ...rest } = current;
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

  /**
   * Completes invite-based app sign-in after Google auth.
   */
  const onSignIn = (usernameInput: string, inviteCodeInput: string): void => {
    const username = normalizeName(usernameInput);
    const inviteCode = normalizeInviteCode(inviteCodeInput);
    const signedInEmail = auth?.currentUser?.email?.trim().toLowerCase() ?? '';

    if (!username) {
      setSignInError('Username is required.');
      return;
    }

    if (!authUserId) {
      setSignInError('Sign in with Google first.');
      return;
    }

    if (!signedInEmail) {
      setSignInError('Unable to confirm your Google account email.');
      return;
    }

    if (!db) {
      setSignInError('Firebase is not configured.');
      return;
    }

    const usersRef = getUsersCollectionRef();
    const settingsRef = getSettingsDocumentRef();
    const invitesRef = getCampaignInvitesCollectionRef();
    if (!usersRef || !settingsRef || !invitesRef) {
      setSignInError('Firebase is not configured.');
      return;
    }

    const userDocRef = doc(usersRef, authUserId);
    const inviteDocRef = doc(invitesRef, inviteCode);

    void runTransaction(db, async (transaction) => {
      const inviteSnapshot = await transaction.get(inviteDocRef);
      let inviteRole: UserRole | null = null;
      let shouldRedeemInvite = false;

      if (inviteSnapshot.exists()) {
        const inviteValue = inviteSnapshot.data();
        const campaignId = typeof inviteValue.campaignId === 'string' ? inviteValue.campaignId : '';
        const inviteRoleValue = inviteValue.role;
        const redeemedByUid = typeof inviteValue.redeemedByUid === 'string' ? inviteValue.redeemedByUid : '';
        const revoked = inviteValue.revoked === true;

        if (!campaignId || campaignId !== APP_NAMESPACE) {
          throw new Error('This invite code is for a different campaign.');
        }

        if (!isUserRole(inviteRoleValue)) {
          throw new Error('Invite code role is invalid.');
        }

        if (revoked) {
          throw new Error('This invite code has been revoked.');
        }

        if (redeemedByUid && redeemedByUid !== authUserId) {
          throw new Error('This invite code has already been used.');
        }

        inviteRole = inviteRoleValue;
        shouldRedeemInvite = !redeemedByUid;
      } else {
        // Compatibility path for older deployments still using static invite env vars.
        if (inviteCode === normalizeInviteCode(LEGACY_ADMIN_INVITE_CODE)) {
          inviteRole = 'admin';
        } else if (inviteCode === normalizeInviteCode(LEGACY_MEMBER_INVITE_CODE)) {
          inviteRole = 'member';
        }
      }

      if (!inviteRole) {
        throw new Error('Invalid invite code.');
      }

      const userSnapshot = await transaction.get(userDocRef);
      if (userSnapshot.exists()) {
        const existingRole = userSnapshot.data().role;
        if (!isUserRole(existingRole)) {
          throw new Error('Profile role is invalid.');
        }

        if (existingRole !== inviteRole) {
          throw new Error('This Google profile is already registered with a different invite type.');
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
            role: inviteRole,
            createdAt: serverTimestamp(),
            lastSeenAt: serverTimestamp()
          },
          { merge: true }
        );
      }

      if (!state.hostUserId) {
        transaction.set(settingsRef, { hostUserId: authUserId, updatedAt: serverTimestamp() }, { merge: true });
      }

      if (shouldRedeemInvite) {
        transaction.update(inviteDocRef, {
          redeemedByUid: authUserId
        });
      }
    })
      .then(() => {
        setSessionUserId(authUserId);
        setSignInError('');
        setAppError('');
      })
      .catch((error: unknown) => {
        if (error instanceof Error) {
          setSignInError(error.message);
          return;
        }

        setSignInError('Unable to sign in at this time.');
      });
  };

  /**
   * Starts Google OAuth popup.
   */
  const onGoogleSignIn = (): void => {
    if (!auth || isGoogleSigningIn) {
      return;
    }

    setIsGoogleSigningIn(true);
    setSignInError('');

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    void signInWithPopup(auth, provider)
      .catch(() => {
        setSignInError('Unable to sign in with Google right now.');
      })
      .finally(() => {
        setIsGoogleSigningIn(false);
      });
  };

  /**
   * Creates a new invite document for admin-created onboarding.
   */
  const onCreateInvite = (role: UserRole): void => {
    if (!currentUser || currentUser.role !== 'admin') {
      return;
    }

    const invitesRef = getCampaignInvitesCollectionRef();
    if (!invitesRef) {
      setInviteError('Firebase is not configured.');
      return;
    }

    const inviteCode = createInviteCode();
    const inviteCodeId = normalizeInviteCode(inviteCode);

    setInviteError('');
    setIsCreatingInvite(true);

    void setDoc(doc(invitesRef, inviteCodeId), {
      campaignId: APP_NAMESPACE,
      role,
      createdByUid: currentUser.id,
      createdAt: serverTimestamp(),
      revoked: false,
      redeemedByUid: ''
    })
      .then(() => {
        setLatestInviteCode(inviteCode);
      })
      .catch(() => {
        setInviteError('Unable to create invite code.');
      })
      .finally(() => {
        setIsCreatingInvite(false);
      });
  };

  /**
   * Soft-revokes an invite code by setting `revoked: true`.
   */
  const onRevokeInvite = (code: string): void => {
    if (!currentUser || currentUser.role !== 'admin') {
      return;
    }

    const invitesRef = getCampaignInvitesCollectionRef();
    if (!invitesRef) {
      setInviteError('Firebase is not configured.');
      return;
    }

    setInviteError('');
    void setDoc(
      doc(invitesRef, code),
      {
        revoked: true
      },
      { merge: true }
    ).catch(() => {
      setInviteError('Unable to revoke invite code.');
    });
  };

  /**
   * Changes host user in local state and persists the choice.
   */
  const onSetHostUserId = (userId: string): void => {
    if (!currentUser || currentUser.role !== 'admin') {
      return;
    }

    const settingsRef = getSettingsDocumentRef();
    if (!settingsRef || !state.users.some((user) => user.id === userId)) {
      return;
    }

    setState((current) => ({
      ...current,
      hostUserId: userId
    }));

    void setDoc(settingsRef, { hostUserId: userId, updatedAt: serverTimestamp() }, { merge: true }).catch(() => {
      setAppError('Unable to update host assignment.');
    });
  };

  /**
   * Clears local state and signs out from Firebase Auth.
   */
  const onSignOut = (): void => {
    setState(INITIAL_PERSISTED_STATE);
    setSessionUserId('');
    setInvites([]);
    setLatestInviteCode('');
    setInviteError('');
    setSignInError('');
    setAppError('');
    setIsPainting(false);
    setPendingEdits({});
    setIsSavingChanges(false);

    if (!auth) {
      return;
    }

    void signOut(auth).catch(() => {
      setAppError('Unable to sign out cleanly.');
    });
  };

  /**
   * Guards month updates so invalid values cannot poison date calculations.
   */
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
          {/* Keep a single <main> wrapper for the config error state. */}
          <section className="page-card sign-in-card">
            <h2>Missing Firebase Config</h2>
            <p>{firebaseConfigError}</p>
          </section>
        </main>
      </div>
    );
  }

  if (!authReady || !dataReady) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <h1>DnD Group Scheduler</h1>
          <p>Connecting to shared schedule data...</p>
        </header>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <h1>DnD Group Scheduler</h1>
          <p>Invite-only scheduling board for your party.</p>
        </header>
        <main>
          <SignInPage
            authUserId={authUserId}
            onGoogleSignIn={onGoogleSignIn}
            isGoogleSigningIn={isGoogleSigningIn}
            onSignIn={onSignIn}
            error={signInError}
          />
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

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>DnD Group Scheduler</h1>
        <p>
          Signed in as <strong>{currentUser.name}</strong> ({currentUser.role}). Host:{' '}
          <strong>{hostUser?.name ?? 'Not set'}</strong>
        </p>
        <button type="button" className="ghost-button sign-out-button" onClick={onSignOut}>
          Sign Out
        </button>
        {appError ? <p className="form-error">{appError}</p> : null}
      </header>

      <nav className="top-nav" aria-label="Primary">
        <NavLink to="/" end>
          My Availability
        </NavLink>
        {canViewHostSummary ? <NavLink to="/host">Host Summary</NavLink> : null}
        {currentUser.role === 'admin' ? <NavLink to="/admin">Admin Management</NavLink> : null}
      </nav>

      <main>
        <Routes>
          <Route path="/" element={<PersonalAvailabilityPage {...personalAvailabilityPageProps} />} />
          <Route
            path="/host"
            element={
              canViewHostSummary ? (
                <HostSummaryPage
                  users={state.users}
                  currentUser={currentUser}
                  hostUserId={state.hostUserId}
                  monthDateKeys={monthDateKeys}
                  getStatus={getStatus}
                />
              ) : (
                <PersonalAvailabilityPage {...personalAvailabilityPageProps} />
              )
            }
          />
          <Route
            path="/admin"
            element={
              <AdminManagementPage
                currentUser={currentUser}
                campaignId={APP_NAMESPACE}
                users={state.users}
                hostUserId={state.hostUserId}
                setHostUserId={onSetHostUserId}
                invites={invites}
                latestInviteCode={latestInviteCode}
                inviteError={inviteError}
                isCreatingInvite={isCreatingInvite}
                onCreateInvite={onCreateInvite}
                onRevokeInvite={onRevokeInvite}
              />
            }
          />
          <Route path="*" element={<PersonalAvailabilityPage {...personalAvailabilityPageProps} />} />
        </Routes>
      </main>
    </div>
  );
}
