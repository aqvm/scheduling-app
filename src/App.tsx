import { useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut
} from 'firebase/auth';
import { auth, db, firebaseConfigError } from './firebase';
import { AdminManagementPage } from './features/admin/AdminManagementPage';
import { JoinCampaignDialog } from './features/app/components/JoinCampaignDialog';
import { CampaignSelector } from './features/app/components/CampaignSelector';
import { HeaderActionButtons } from './features/app/components/HeaderActionButtons';
import { NameChangeRequestDialog } from './features/app/components/NameChangeRequestDialog';
import { useAuthSession } from './features/app/hooks/useAuthSession';
import { useCampaignData } from './features/app/hooks/useCampaignData';
import { useAvailabilityEditor } from './features/app/hooks/useAvailabilityEditor';
import {
  createCampaign,
  deleteCampaign,
  joinCampaignWithInvite,
  kickUserFromCampaign,
  reviewNameChangeRequest,
  setCampaignHostUserId,
  setInviteEnabled,
  submitNameChangeRequest
} from './features/app/services/campaignOperations';
import {
  formatFirebaseError,
  getErrorCode,
  isSignedInWithGoogle,
  POPUP_REDIRECT_FALLBACK_ERRORS
} from './features/app/utils';
import { SignInPage } from './features/auth/SignInPage';
import { PersonalAvailabilityPage } from './features/availability/PersonalAvailabilityPage';
import { HostSummaryPage } from './features/host/HostSummaryPage';
import { normalizeInviteCode, normalizeName } from './shared/scheduler/validation';

export default function App() {
  const { authUserId, authReady, profileReady, userProfile, setUserProfile } = useAuthSession();

  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false);
  const [isUpdatingInvite, setIsUpdatingInvite] = useState(false);
  const [isDeletingCampaign, setIsDeletingCampaign] = useState(false);
  const [removingUserId, setRemovingUserId] = useState('');
  const [isJoinCampaignDialogOpen, setIsJoinCampaignDialogOpen] = useState(false);
  const [joinCampaignNameInput, setJoinCampaignNameInput] = useState('');
  const [joinCampaignInviteInput, setJoinCampaignInviteInput] = useState('');
  const [joinCampaignError, setJoinCampaignError] = useState('');
  const [isNameChangeDialogOpen, setIsNameChangeDialogOpen] = useState(false);
  const [nameChangeNameInput, setNameChangeNameInput] = useState('');
  const [isJoiningCampaign, setIsJoiningCampaign] = useState(false);
  const [isSubmittingNameChangeRequest, setIsSubmittingNameChangeRequest] = useState(false);
  const [processingNameChangeRequestId, setProcessingNameChangeRequestId] = useState('');
  const [signInError, setSignInError] = useState('');
  const [nameChangeInfo, setNameChangeInfo] = useState('');
  const [appError, setAppError] = useState('');
  const [managementError, setManagementError] = useState('');

  const currentUser =
    userProfile !== null && authUserId.length > 0 && userProfile.id === authUserId ? userProfile : null;

  const {
    memberships,
    campaigns,
    selectedCampaignId,
    setSelectedCampaignId,
    campaignUsers,
    campaignAvailability,
    hostUserId,
    setHostUserId,
    activeNameChangeRequest,
    nameChangeRequests,
    resetCampaignData
  } = useCampaignData(currentUser);

  const selectedMembershipAlias =
    currentUser && selectedCampaignId
      ? memberships.find(
          (membership) =>
            membership.campaignId === selectedCampaignId &&
            membership.userId === currentUser.id
        )?.alias ?? ''
      : '';
  const displayAlias = selectedMembershipAlias || currentUser?.alias || '';
  const displayUser = currentUser ? { ...currentUser, alias: displayAlias } : null;
  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null;
  const hostUser = campaignUsers.find((user) => user.id === hostUserId) ?? null;
  const canViewHostSummary =
    currentUser !== null &&
    selectedCampaign !== null &&
    (currentUser.role === 'admin' || currentUser.id === hostUserId);

  const {
    selectedAvailabilityMonth,
    selectedHostSummaryMonth,
    selectedPaintStatus,
    setSelectedPaintStatus,
    availabilityMonthDates,
    hostSummaryMonthDateKeys,
    hasUnsavedChanges,
    isSavingChanges,
    getStatus,
    paintDate,
    toggleDate,
    onSaveChanges,
    onChangeAvailabilityMonth,
    onChangeHostSummaryMonth,
    resetAvailabilityEditor
  } = useAvailabilityEditor({
    currentUserId: currentUser?.id ?? null,
    selectedCampaignId,
    campaignAvailability,
    onError: setAppError
  });

  const onOpenJoinCampaignDialog = (): void => {
    setSignInError('');
    setNameChangeInfo('');
    setJoinCampaignError('');
    setJoinCampaignNameInput(selectedMembershipAlias || displayAlias || '');
    setJoinCampaignInviteInput('');
    setIsJoinCampaignDialogOpen(true);
  };

  const onOpenNameChangeDialog = (): void => {
    setSignInError('');
    setNameChangeInfo('');
    setNameChangeNameInput('');
    setIsNameChangeDialogOpen(true);
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
            setSignInError(
              formatFirebaseError(redirectError, 'Unable to sign in with Google right now.')
            );
          });
        }

        setSignInError(formatFirebaseError(error, 'Unable to sign in with Google right now.'));
      })
      .finally(() => {
        setIsGoogleSigningIn(false);
      });
  };

  const onJoinCampaign = (inviteCodeInput: string, nameInput: string): void => {
    const inviteCode = normalizeInviteCode(inviteCodeInput);
    const authUser = auth?.currentUser ?? null;
    const signedInUserId = authUser?.uid ?? authUserId;
    const requestedAlias = normalizeName(nameInput);

    if (!signedInUserId) {
      setJoinCampaignError('Sign in with Google first.');
      return;
    }

    if (!isSignedInWithGoogle(authUser)) {
      setJoinCampaignError('Google sign-in session is missing. Please continue with Google again.');
      return;
    }

    if (requestedAlias.length > 64) {
      setJoinCampaignError('Name must be 64 characters or fewer.');
      return;
    }

    if (!db) {
      setJoinCampaignError('Firebase is not configured.');
      return;
    }

    if (!inviteCode) {
      setJoinCampaignError('Campaign invite code is required to join a campaign.');
      return;
    }

    setJoinCampaignError('');
    setNameChangeInfo('');
    setIsJoiningCampaign(true);

    void joinCampaignWithInvite({
      firestore: db,
      signedInUserId,
      inviteCode,
      requestedAlias
    })
      .then((inviteCampaignId) => {
        if (inviteCampaignId) {
          setSelectedCampaignId(inviteCampaignId);
        }

        setJoinCampaignNameInput('');
        setJoinCampaignInviteInput('');
        setIsJoinCampaignDialogOpen(false);
        setJoinCampaignError('');
        setNameChangeInfo('');
        setAppError('');
      })
      .catch((error: unknown) => {
        setJoinCampaignError(formatFirebaseError(error, 'Unable to join campaign at this time.'));
      })
      .finally(() => {
        setIsJoiningCampaign(false);
      });
  };

  const onRequestNameChange = (nameInput: string): void => {
    if (!currentUser || !selectedCampaignId) {
      setSignInError('Select a campaign before requesting a name change.');
      return;
    }

    const requestedAlias = normalizeName(nameInput);
    if (!requestedAlias) {
      setSignInError('Enter the name you want to request.');
      return;
    }

    if (requestedAlias.length > 64) {
      setSignInError('Name must be 64 characters or fewer.');
      return;
    }

    if (!selectedMembershipAlias) {
      setSignInError('Join this campaign before requesting a name change.');
      return;
    }

    if (requestedAlias === selectedMembershipAlias) {
      setSignInError('That is already your name for this campaign.');
      return;
    }

    if (
      activeNameChangeRequest &&
      activeNameChangeRequest.status === 'pending' &&
      activeNameChangeRequest.requestedAlias === requestedAlias
    ) {
      setSignInError('That name change request is already pending admin approval.');
      return;
    }

    if (!db) {
      setSignInError('Firebase is not configured.');
      return;
    }

    setSignInError('');
    setNameChangeInfo('');
    setIsSubmittingNameChangeRequest(true);

    void submitNameChangeRequest({
      firestore: db,
      campaignId: selectedCampaignId,
      userId: currentUser.id,
      requestedAlias
    })
      .then(() => {
        setNameChangeNameInput('');
        setIsNameChangeDialogOpen(false);
        setNameChangeInfo('Name change request submitted for admin approval.');
      })
      .catch((error: unknown) => {
        setSignInError(
          formatFirebaseError(error, 'Unable to submit name change request right now.')
        );
      })
      .finally(() => {
        setIsSubmittingNameChangeRequest(false);
      });
  };

  const onReviewNameChangeRequest = (
    requestId: string,
    nextStatus: 'approved' | 'rejected'
  ): void => {
    if (!currentUser || currentUser.role !== 'admin' || !selectedCampaignId || !db) {
      return;
    }

    setManagementError('');
    setProcessingNameChangeRequestId(requestId);

    void reviewNameChangeRequest({
      firestore: db,
      selectedCampaignId,
      requestId,
      reviewerUserId: currentUser.id,
      nextStatus
    })
      .catch((error: unknown) => {
        setManagementError(formatFirebaseError(error, 'Unable to review name change request.'));
      })
      .finally(() => {
        setProcessingNameChangeRequestId('');
      });
  };

  const onApproveNameChangeRequest = (requestId: string): void => {
    onReviewNameChangeRequest(requestId, 'approved');
  };

  const onRejectNameChangeRequest = (requestId: string): void => {
    onReviewNameChangeRequest(requestId, 'rejected');
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

    setManagementError('');
    setIsCreatingCampaign(true);

    void createCampaign({
      firestore: db,
      currentUserId: currentUser.id,
      campaignName,
      currentUserAlias: currentUser.alias,
      displayAlias
    })
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

    setManagementError('');
    setIsUpdatingInvite(true);

    void setInviteEnabled({
      firestore: db,
      campaignId: selectedCampaign.id,
      inviteCode: selectedCampaign.inviteCode,
      enabled
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

    setManagementError('');
    setIsDeletingCampaign(true);

    const campaignToDelete = selectedCampaign;

    void deleteCampaign({
      firestore: db,
      campaignId: campaignToDelete.id,
      inviteCode: campaignToDelete.inviteCode
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

    setManagementError('');
    setRemovingUserId(userId);

    void kickUserFromCampaign({
      firestore: db,
      campaignId: selectedCampaign.id,
      userId,
      hostUserId,
      campaignUserIds: campaignUsers.map((user) => user.id)
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

    if (!campaignUsers.some((user) => user.id === userId)) {
      return;
    }

    setHostUserId(userId);

    void setCampaignHostUserId({ campaignId: selectedCampaign.id, userId }).catch(() => {
      setAppError('Unable to update host assignment.');
    });
  };

  const onSignOut = (): void => {
    setUserProfile(null);
    resetCampaignData();
    resetAvailabilityEditor();

    setIsGoogleSigningIn(false);
    setIsCreatingCampaign(false);
    setIsUpdatingInvite(false);
    setIsDeletingCampaign(false);
    setRemovingUserId('');
    setJoinCampaignError('');
    setIsJoinCampaignDialogOpen(false);
    setJoinCampaignNameInput('');
    setJoinCampaignInviteInput('');
    setIsNameChangeDialogOpen(false);
    setNameChangeNameInput('');
    setIsJoiningCampaign(false);
    setIsSubmittingNameChangeRequest(false);
    setProcessingNameChangeRequestId('');
    setNameChangeInfo('');
    setManagementError('');
    setSignInError('');
    setAppError('');

    if (!auth) {
      return;
    }

    void signOut(auth).catch(() => {
      setAppError('Unable to sign out cleanly.');
    });
  };

  const activeNameChangeRequestNote =
    activeNameChangeRequest && activeNameChangeRequest.campaignId === selectedCampaignId
      ? activeNameChangeRequest.status === 'pending'
        ? `Pending name change request: "${activeNameChangeRequest.requestedAlias}".`
        : activeNameChangeRequest.status === 'approved'
          ? `Name change approved: "${activeNameChangeRequest.requestedAlias}".`
          : `Name change request was rejected: "${activeNameChangeRequest.requestedAlias}".`
      : '';

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

  const campaignSelectionControl = (
    <CampaignSelector
      selectedCampaignId={selectedCampaignId}
      campaigns={campaigns}
      onChangeSelectedCampaignId={setSelectedCampaignId}
    />
  );

  const headerActionButtons = (
    <HeaderActionButtons
      showNameChangeButton={currentUser !== null}
      canRequestNameChange={Boolean(selectedCampaignId && selectedMembershipAlias)}
      isSubmittingNameChangeRequest={isSubmittingNameChangeRequest}
      onJoinCampaign={onOpenJoinCampaignDialog}
      onRequestNameChange={onOpenNameChangeDialog}
    />
  );

  const joinCampaignDialog = (
    <JoinCampaignDialog
      isOpen={isJoinCampaignDialogOpen}
      nameInput={joinCampaignNameInput}
      inviteCodeInput={joinCampaignInviteInput}
      error={joinCampaignError}
      isJoining={isJoiningCampaign}
      defaultNamePlaceholder={selectedMembershipAlias || 'e.g., Alex (not the campaign name)'}
      onChangeNameInput={(value) => {
        setJoinCampaignNameInput(value);
        if (joinCampaignError) {
          setJoinCampaignError('');
        }
      }}
      onChangeInviteCodeInput={(value) => {
        setJoinCampaignInviteInput(value);
        if (joinCampaignError) {
          setJoinCampaignError('');
        }
      }}
      onSubmit={() => onJoinCampaign(joinCampaignInviteInput, joinCampaignNameInput)}
      onClose={() => {
        setJoinCampaignError('');
        setIsJoinCampaignDialogOpen(false);
      }}
    />
  );

  const nameChangeDialog = (
    <NameChangeRequestDialog
      isOpen={isNameChangeDialogOpen && currentUser !== null}
      nameInput={nameChangeNameInput}
      isSubmitting={isSubmittingNameChangeRequest}
      onChangeNameInput={(value) => {
        setNameChangeNameInput(value);
        if (signInError) {
          setSignInError('');
        }
        if (nameChangeInfo) {
          setNameChangeInfo('');
        }
      }}
      onSubmit={() => onRequestNameChange(nameChangeNameInput)}
      onClose={() => setIsNameChangeDialogOpen(false)}
    />
  );

  if (!currentUser) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <h1>DnD Group Scheduler</h1>
          <p>Signed in with Google. Join a campaign to continue.</p>
          <div className="header-controls">
            {campaignSelectionControl}
            {headerActionButtons}
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
            <p>Click Join Campaign above and submit your campaign invite code.</p>
          </section>
        </main>
        {joinCampaignDialog}
      </div>
    );
  }

  const personalAvailabilityPageProps = {
    currentUser: displayUser ?? currentUser,
    monthDates: availabilityMonthDates,
    monthValue: selectedAvailabilityMonth,
    setMonthValue: onChangeAvailabilityMonth,
    paintStatus: selectedPaintStatus,
    setPaintStatus: setSelectedPaintStatus,
    getStatus,
    onPaintDate: paintDate,
    onToggleDate: toggleDate,
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
          Signed in as <strong>{displayAlias || currentUser.alias}</strong> ({currentUser.role}). Campaign:{' '}
          <strong>{selectedCampaign?.name ?? 'None selected'}</strong>. Host:{' '}
          <strong>{hostUser?.alias ?? 'Not set'}</strong>
        </p>
        <div className="header-controls">
          {campaignSelectionControl}
          {headerActionButtons}
          <button type="button" className="ghost-button sign-out-button" onClick={onSignOut}>
            Sign Out
          </button>
        </div>
        {signInError ? <p className="form-error">{signInError}</p> : null}
        {nameChangeInfo ? <p className="form-note">{nameChangeInfo}</p> : null}
        {activeNameChangeRequestNote ? <p className="form-note">{activeNameChangeRequestNote}</p> : null}
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
                  currentUser={displayUser ?? currentUser}
                  hostUserId={hostUserId}
                  monthValue={selectedHostSummaryMonth}
                  setMonthValue={onChangeHostSummaryMonth}
                  monthDateKeys={hostSummaryMonthDateKeys}
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
                currentUser={displayUser ?? currentUser}
                selectedCampaign={selectedCampaign}
                users={campaignUsers}
                hostUserId={hostUserId}
                setHostUserId={onSetHostUserId}
                nameChangeRequests={nameChangeRequests}
                processingNameChangeRequestId={processingNameChangeRequestId}
                managementError={managementError}
                isCreatingCampaign={isCreatingCampaign}
                isUpdatingInvite={isUpdatingInvite}
                isDeletingCampaign={isDeletingCampaign}
                removingUserId={removingUserId}
                onCreateCampaign={onCreateCampaign}
                onSetInviteEnabled={onSetInviteEnabled}
                onDeleteCampaign={onDeleteCampaign}
                onKickUser={onKickUser}
                onApproveNameChangeRequest={onApproveNameChangeRequest}
                onRejectNameChangeRequest={onRejectNameChangeRequest}
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

      {joinCampaignDialog}
      {nameChangeDialog}
    </div>
  );
}

