/**
 * This file contains invite-code generation logic.
 */

/**
 * Creates a human-friendly invite code in the shape `XXXX-XXXX-XXXX`.
 * Ambiguous characters are omitted to reduce transcription errors.
 */
export function createInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segments = [4, 4, 4];
  const chars: string[] = [];

  segments.forEach((segmentLength, segmentIndex) => {
    for (let index = 0; index < segmentLength; index += 1) {
      const randomIndex = Math.floor(Math.random() * alphabet.length);
      chars.push(alphabet[randomIndex]);
    }

    if (segmentIndex < segments.length - 1) {
      chars.push('-');
    }
  });

  return chars.join('');
}
