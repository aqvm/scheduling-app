import { useEffect, useState } from 'react';
import type { Campaign, UserProfile } from '../../shared/scheduler/types';

/**
 * Props used by the admin-only management page.
 */
type AdminManagementPageProps = {
  currentUser: UserProfile;
  selectedCampaign: Campaign | null;
  users: UserProfile[];
  hostUserId: string;
  setHostUserId: (userId: string) => void;
  managementError: string;
  isCreatingCampaign: boolean;
  isUpdatingInvite: boolean;
  isDeletingCampaign: boolean;
  removingUserId: string;
  onCreateCampaign: (campaignName: string) => void;
  onSetInviteEnabled: (enabled: boolean) => void;
  onDeleteCampaign: () => void;
  onKickUser: (userId: string) => void;
};

/**
 * Admin management screen:
 * - create campaigns
 * - enable/disable selected campaign invite code
 * - assign host user
 * - kick users from selected campaign
 */
export function AdminManagementPage({
  currentUser,
  selectedCampaign,
  users,
  hostUserId,
  setHostUserId,
  managementError,
  isCreatingCampaign,
  isUpdatingInvite,
  isDeletingCampaign,
  removingUserId,
  onCreateCampaign,
  onSetInviteEnabled,
  onDeleteCampaign,
  onKickUser
}: AdminManagementPageProps) {
  const [campaignName, setCampaignName] = useState('');
  const [inviteCopyState, setInviteCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    setInviteCopyState('idle');
  }, [selectedCampaign?.id, selectedCampaign?.inviteCode]);

  const onCopyInviteCode = async (inviteCode: string): Promise<void> => {
    const normalizedInviteCode = inviteCode.toUpperCase();

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(normalizedInviteCode);
        setInviteCopyState('copied');
        return;
      }

      const fallbackTextarea = document.createElement('textarea');
      fallbackTextarea.value = normalizedInviteCode;
      fallbackTextarea.setAttribute('readonly', '');
      fallbackTextarea.style.position = 'absolute';
      fallbackTextarea.style.left = '-9999px';
      document.body.appendChild(fallbackTextarea);
      fallbackTextarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(fallbackTextarea);
      setInviteCopyState(copied ? 'copied' : 'failed');
    } catch {
      setInviteCopyState('failed');
    }
  };

  if (currentUser.role !== 'admin') {
    return (
      <section className="page-card">
        <h2>Campaign Management</h2>
        <p>Only admin can access this page.</p>
      </section>
    );
  }

  return (
    <section className="page-card">
      <h2>Campaign Management</h2>
      <p>Create campaigns, control invite code state, assign host, and remove users.</p>

      <section className="summary-block">
        <h3>Create Campaign</h3>
        <form
          className="invite-create-row"
          onSubmit={(event) => {
            event.preventDefault();
            onCreateCampaign(campaignName);
            setCampaignName('');
          }}
        >
          <label className="month-picker" htmlFor="campaign-name-input">
            Campaign Name
            <input
              id="campaign-name-input"
              type="text"
              value={campaignName}
              onChange={(event) => setCampaignName(event.target.value)}
              maxLength={64}
              required
            />
          </label>
          <button
            type="submit"
            className="primary-button"
            disabled={isCreatingCampaign}
          >
            {isCreatingCampaign ? 'Creating...' : 'Create Campaign'}
          </button>
        </form>
      </section>

      <section className="summary-block">
        <h3>Selected Campaign Invite</h3>
        {!selectedCampaign ? (
          <p className="empty-note">Select a campaign first.</p>
        ) : (
          <div className="admin-list">
            <div className="admin-row">
              <span>
                <strong>{selectedCampaign.name}</strong>
                <div className="invite-code-row">
                  <small>
                    Invite code: <code>{selectedCampaign.inviteCode.toUpperCase()}</code>
                  </small>
                  <button
                    type="button"
                    className="ghost-button copy-code-button"
                    onClick={() => onCopyInviteCode(selectedCampaign.inviteCode)}
                  >
                    {inviteCopyState === 'copied'
                      ? 'Copied'
                      : inviteCopyState === 'failed'
                        ? 'Retry Copy'
                        : 'Copy'}
                  </button>
                </div>
                <small>{selectedCampaign.inviteEnabled ? 'Invite Active' : 'Invite Disabled'}</small>
              </span>
              <div className="admin-actions">
                <button
                  type="button"
                  className="ghost-button"
                  disabled={isUpdatingInvite || isDeletingCampaign}
                  onClick={() => onSetInviteEnabled(!selectedCampaign.inviteEnabled)}
                >
                  {selectedCampaign.inviteEnabled ? 'Disable Invite' : 'Enable Invite'}
                </button>
                <button
                  type="button"
                  className="ghost-button danger-button"
                  disabled={isDeletingCampaign || isUpdatingInvite}
                  onClick={() => {
                    const isConfirmed = window.confirm(
                      `Delete "${selectedCampaign.name}" and all campaign data? This cannot be undone.`
                    );
                    if (isConfirmed) {
                      onDeleteCampaign();
                    }
                  }}
                >
                  {isDeletingCampaign ? 'Deleting...' : 'Delete Campaign'}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {managementError ? <p className="form-error">{managementError}</p> : null}

      <section className="summary-block">
        <h3>Host Assignment</h3>
        {!selectedCampaign ? (
          <p className="empty-note">Select a campaign first.</p>
        ) : null}
        <div className="admin-list">
          {users.length === 0 ? (
            <p className="empty-note">No users are in this campaign yet.</p>
          ) : (
            users.map((user) => (
              <label key={user.id} className="admin-row">
                <span>
                  <strong>{user.name}</strong>
                  <small>{user.email || 'No email on file yet'}</small>
                </span>
                <input
                  type="radio"
                  name="host-user"
                  checked={hostUserId === user.id}
                  onChange={() => setHostUserId(user.id)}
                />
              </label>
            ))
          )}
        </div>
      </section>

      <section className="summary-block">
        <h3>Campaign Members</h3>
        {!selectedCampaign ? (
          <p className="empty-note">Select a campaign first.</p>
        ) : (
          <div className="admin-list">
            {users.length === 0 ? (
              <p className="empty-note">No users are in this campaign yet.</p>
            ) : (
              users.map((user) => (
                <div key={`remove-${user.id}`} className="admin-row">
                  <span>
                    <strong>{user.name}</strong>
                    <small>{user.email || 'No email on file yet'}</small>
                  </span>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={user.id === currentUser.id || removingUserId === user.id}
                    onClick={() => onKickUser(user.id)}
                  >
                    {removingUserId === user.id ? 'Removing...' : user.id === currentUser.id ? 'Current Admin' : 'Kick'}
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </section>
    </section>
  );
}
