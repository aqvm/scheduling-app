/**
 * This file contains invite-code generation logic.
 */

function getSecureRandomValues(length: number): Uint32Array {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
    throw new Error('Secure random generator is unavailable in this browser.');
  }

  const randomValues = new Uint32Array(length);
  cryptoApi.getRandomValues(randomValues);
  return randomValues;
}

/**
 * Creates a human-friendly invite code in the shape `XXXX-XXXX-XXXX`.
 * Ambiguous characters are omitted to reduce transcription errors.
 */
export function createInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segments = [4, 4, 4];
  const totalCharacters = segments.reduce((sum, segmentLength) => sum + segmentLength, 0);
  const randomValues = getSecureRandomValues(totalCharacters);
  const chars: string[] = [];
  let randomOffset = 0;

  segments.forEach((segmentLength, segmentIndex) => {
    for (let index = 0; index < segmentLength; index += 1) {
      const randomIndex = randomValues[randomOffset] % alphabet.length;
      randomOffset += 1;
      chars.push(alphabet[randomIndex]);
    }

    if (segmentIndex < segments.length - 1) {
      chars.push('-');
    }
  });

  return chars.join('');
}
