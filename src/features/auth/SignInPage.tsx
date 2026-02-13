import { useState } from 'react';

/**
 * Props for the sign-in view shown before a user enters the scheduler.
 */
type SignInPageProps = {
  /**
   * Firebase Auth user id from Google sign-in.
   * Presence means the OAuth step is complete.
   */
  authUserId: string;

  /**
   * Starts Google OAuth popup flow.
   */
  onGoogleSignIn: () => void;

  /**
   * Prevents duplicate OAuth popup requests.
   */
  isGoogleSigningIn: boolean;

  /**
   * Completes app-level sign-in by validating invite code and storing profile.
   */
  onSignIn: (username: string, inviteCode: string) => void;

  /**
   * User-facing validation or server error message.
   */
  error: string;
};

/**
 * Pre-authentication screen:
 * 1) user signs in with Google,
 * 2) user enters username + invite code.
 */
export function SignInPage({
  authUserId,
  onGoogleSignIn,
  isGoogleSigningIn,
  onSignIn,
  error
}: SignInPageProps) {
  // Local form state is intentionally isolated to this view.
  const [username, setUsername] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const hasGoogleSession = authUserId.length > 0;

  return (
    <section className="page-card sign-in-card">
      <h2>Join Scheduler</h2>
      <p>
        {hasGoogleSession
          ? 'Google account connected. Enter your invite code and username to access the calendar.'
          : 'Sign in with Google first, then enter your invite code and username.'}
      </p>

      {hasGoogleSession ? (
        <form
          className="sign-in-form"
          onSubmit={(event) => {
            // Prevent full-page form navigation; the app handles submission in React.
            event.preventDefault();
            onSignIn(username, inviteCode);
          }}
        >
          <label htmlFor="username-input">
            Username
            <input
              id="username-input"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="off"
              maxLength={32}
              required
            />
          </label>

          <label htmlFor="invite-code-input">
            Invite Code
            <input
              id="invite-code-input"
              type="password"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              autoComplete="off"
              required
            />
          </label>

          <button type="submit" className="primary-button">
            Enter
          </button>
        </form>
      ) : (
        <button type="button" className="primary-button google-button" onClick={onGoogleSignIn} disabled={isGoogleSigningIn}>
          {isGoogleSigningIn ? 'Connecting...' : 'Continue with Google'}
        </button>
      )}

      {error ? <p className="form-error">{error}</p> : null}
    </section>
  );
}
