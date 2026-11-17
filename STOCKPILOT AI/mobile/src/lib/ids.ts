import * as Crypto from 'expo-crypto';

/**
 * BR-G4: Generates a client-side UUID v4 before persisting/sending any entity.
 */
export function generateClientId(): string {
  return Crypto.randomUUID();
}
