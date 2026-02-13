import { useState } from 'react';
import type { CampaignInvite, UserProfile, UserRole } from '../../shared/scheduler/types';

/**
 * Props used by the admin-only management page.
 */
type AdminManagementPageProps = {
  currentUser: UserProfile;
  campaignId: string;
  users: UserProfile[];
  hostUserId: string;
  setHostUserId: (userId: string) => void;
  invites: CampaignInvite[];
  latestInviteCode: string;
  inviteError: string;
  isCreatingInvite: boolean;
  onCreateInvite: (role: UserRole) => void;
  onRevokeInvite: (code: string) => void;
};

/**
 * Admin management screen:
 * - create/revoke invite codes
 * - assign host user
 */
export function AdminManagementPage({
  currentUser,
  campaignId,
  users,
  hostUserId,
  setHostUserId,
  invites,
  latestInviteCode,
  inviteError,
  isCreatingInvite,
  onCreateInvite,
  onRevokeInvite
}: AdminManagementPageProps) {
  const [newInviteRole, setNewInviteRole] = useState<UserRole>('member');

  if (currentUser.role !== 'admin') {
    return (
      <section className="page-card">
        <h2>Admin Management</h2>
        <p>Only admin can access this page.</p>
      </section>
    );
  }

  return (
    <section className="page-card">
      <h2>Admin Management</h2>
      <p>Campaign {campaignId} invites, users, and host assignment.</p>

      <section className="summary-block">
        <h3>Campaign Invites</h3>
        <div className="invite-create-row">
          <label className="month-picker" htmlFor="invite-role-select">
            Role
            <select
              id="invite-role-select"
              value={newInviteRole}
              onChange={(event) => setNewInviteRole(event.target.value === 'admin' ? 'admin' : 'member')}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <button
            type="button"
            className="primary-button"
            onClick={() => onCreateInvite(newInviteRole)}
            disabled={isCreatingInvite}
          >
            {isCreatingInvite ? 'Creating...' : 'Create Invite Code'}
          </button>
        </div>

        {latestInviteCode ? (
          <p>
            Latest invite: <code>{latestInviteCode}</code>
          </p>
        ) : null}
        {inviteError ? <p className="form-error">{inviteError}</p> : null}

        <div className="admin-list">
          {invites.length === 0 ? (
            <p className="empty-note">No invite codes created yet.</p>
          ) : (
            invites.map((invite) => (
              <div key={invite.code} className="admin-row">
                <span>
                  <strong>{invite.code.toUpperCase()}</strong>
                  <small>{invite.role === 'admin' ? 'Admin Invite' : 'Member Invite'}</small>
                  <small>
                    {invite.revoked
                      ? 'Revoked'
                      : invite.redeemedByUid
                        ? `Redeemed by ${invite.redeemedByUid}`
                        : 'Active'}
                  </small>
                </span>
                {!invite.revoked && !invite.redeemedByUid ? (
                  <button type="button" className="ghost-button" onClick={() => onRevokeInvite(invite.code)}>
                    Revoke
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="summary-block">
        <h3>Host Assignment</h3>
        <div className="admin-list">
          {users.length === 0 ? (
            <p className="empty-note">No users have signed in yet.</p>
          ) : (
            users.map((user) => (
              <label key={user.id} className="admin-row">
                <span>
                  <strong>{user.name}</strong>
                  <small>{user.email || 'No email on file yet'}</small>
                  <small>{user.role === 'admin' ? 'Admin' : 'Member'}</small>
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
    </section>
  );
}
