import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128-bit IV for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit authentication tag

/**
 * Returns the 32-byte encryption key from environment variable.
 * Throws on startup if the key is missing or malformed.
 */
function getKey(): Buffer {
    const hex = process.env.ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) {
        throw new Error(
            'ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
            'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
        );
    }
    return Buffer.from(hex, 'hex');
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a colon-separated string: `iv:authTag:ciphertext` (all hex).
 * If the input is empty or falsy, returns it unchanged.
 */
export function encrypt(plaintext: string): string {
    if (!plaintext) return plaintext;

    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt an encrypted string produced by `encrypt()`.
 * Gracefully returns the input unchanged if it doesn't match the
 * encrypted format (e.g. legacy plaintext messages).
 */
export function decrypt(ciphertext: string): string {
    if (!ciphertext) return ciphertext;

    // Encrypted format: iv(32 hex chars):authTag(32 hex chars):data
    const parts = ciphertext.split(':');
    if (parts.length !== 3) return ciphertext; // Not encrypted — return as-is

    const [ivHex, authTagHex, encryptedHex] = parts;

    // Validate hex lengths
    if (ivHex.length !== 32 || authTagHex.length !== 32) return ciphertext;

    try {
        const key = getKey();
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch {
        // If decryption fails (wrong key, corrupted data, etc.), return as-is
        return ciphertext;
    }
}
