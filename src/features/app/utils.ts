import type { User } from 'firebase/auth';

export const MAX_INVITE_CREATE_ATTEMPTS = 6;
export const POPUP_REDIRECT_FALLBACK_ERRORS = new Set([
  'auth/cancelled-popup-request',
  'auth/popup-blocked',
  'auth/popup-closed-by-user'
]);

export function membershipDocumentId(campaignId: string, userId: string): string {
  return `${campaignId}_${userId}`;
}

export function getErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return '';
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : '';
}

export function formatFirebaseError(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error) {
    const code = getErrorCode(error);
    return code ? `${error.message} (${code})` : error.message;
  }

  const code = getErrorCode(error);
  return code ? `${fallbackMessage} (${code})` : fallbackMessage;
}

export function isSignedInWithGoogle(user: User | null): boolean {
  if (!user) {
    return false;
  }

  return user.providerData.some((provider) => provider.providerId === 'google.com');
}

export function createUserAlias(userId: string): string {
  const normalized = userId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const suffix = normalized.slice(-6).padStart(6, '0');
  return `Player-${suffix}`;
}
