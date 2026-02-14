/**
 * Props for the sign-in view shown before a user enters the scheduler.
 */
type SignInPageProps = {
  /**
   * User-entered display name used for first-time profile setup.
   */
  displayName: string;

  /**
   * Updates the pending display name.
   */
  setDisplayName: (value: string) => void;

  /**
   * Starts Google OAuth popup flow.
   */
  onGoogleSignIn: () => void;

  /**
   * Prevents duplicate OAuth popup requests.
   */
  isGoogleSigningIn: boolean;

  /**
   * User-facing validation or server error message.
   */
  error: string;
};

/**
 * Pre-authentication screen:
 * - user signs in with Google
 */
export function SignInPage({
  displayName,
  setDisplayName,
  onGoogleSignIn,
  isGoogleSigningIn,
  error
}: SignInPageProps) {
  const privacyPolicyUrl = `${import.meta.env.BASE_URL}privacy-policy.html`;
  const canContinue = displayName.trim().length > 0 && !isGoogleSigningIn;

  return (
    <section className="page-card sign-in-card">
      <h2>Join Scheduler</h2>
      <p>Enter your display name, then sign in with Google to continue.</p>
      <div className="sign-in-form">
        <label htmlFor="sign-in-display-name-input">
          Display Name
          <input
            id="sign-in-display-name-input"
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            autoComplete="nickname"
            spellCheck={false}
            maxLength={64}
            required
          />
        </label>
        <button type="button" className="primary-button google-button" onClick={onGoogleSignIn} disabled={!canContinue}>
          {isGoogleSigningIn ? 'Connecting...' : 'Continue with Google'}
        </button>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      <p className="legal-note">
        By continuing, you agree to this app&apos;s{' '}
        <a href={privacyPolicyUrl} target="_blank" rel="noreferrer">
          Privacy Policy
        </a>
        .
      </p>
    </section>
  );
}
