import { useState } from 'react';
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
  removingUserId: string;
  onCreateCampaign: (campaignName: string) => void;
  onSetInviteEnabled: (enabled: boolean) => void;
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
  removingUserId,
  onCreateCampaign,
  onSetInviteEnabled,
  onKickUser
}: AdminManagementPageProps) {
  const [campaignName, setCampaignName] = useState('');

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
                <small>
                  Invite code: <code>{selectedCampaign.inviteCode.toUpperCase()}</code>
                </small>
                <small>{selectedCampaign.inviteEnabled ? 'Invite Active' : 'Invite Disabled'}</small>
              </span>
              <button
                type="button"
                className="ghost-button"
                disabled={isUpdatingInvite}
                onClick={() => onSetInviteEnabled(!selectedCampaign.inviteEnabled)}
              >
                {selectedCampaign.inviteEnabled ? 'Disable Invite' : 'Enable Invite'}
              </button>
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
