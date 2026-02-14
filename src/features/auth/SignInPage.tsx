/**
 * Props for the sign-in view shown before a user enters the scheduler.
 */
type SignInPageProps = {
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
  onGoogleSignIn,
  isGoogleSigningIn,
  error
}: SignInPageProps) {
  const privacyPolicyUrl = `${import.meta.env.BASE_URL}privacy-policy.html`;

  return (
    <section className="page-card sign-in-card">
      <h2>Join Scheduler</h2>
      <p>Sign in with Google to continue.</p>
      <button type="button" className="primary-button google-button" onClick={onGoogleSignIn} disabled={isGoogleSigningIn}>
        {isGoogleSigningIn ? 'Connecting...' : 'Continue with Google'}
      </button>

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
