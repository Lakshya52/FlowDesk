import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit IV (standard for GCM)
const AUTH_TAG_BYTES = 16;

function isHexOfLength(value: string, length: number): boolean {
	return (
		typeof value === "string" &&
		value.length === length &&
		/^[0-9a-fA-F]+$/.test(value)
	);
}

/**
 * 32-byte key for token-subject encryption.
 * Prefers ENCRYPTION_KEY (64 hex chars) when configured, otherwise derives
 * a stable key from JWT_SECRET via SHA-256 so existing deployments keep
 * working without a new env var.
 */
function getTokenKey(): Buffer {
	const hex = (process.env.ENCRYPTION_KEY || "").trim();
	if (hex && isHexOfLength(hex, 64)) {
		return Buffer.from(hex, "hex");
	}
	return crypto
		.createHash("sha256")
		.update(process.env.JWT_SECRET || "flowdesk-fallback-token-key")
		.digest();
}

const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;

/** Encrypt `{ userId, tenantId }` into an opaque `sub` string for the JWT. */
export function encryptTokenSubject(
	userId: string,
	tenantId?: string,
): string {
	const key = getTokenKey();
	const iv = crypto.randomBytes(IV_BYTES);
	const plaintext = JSON.stringify({ u: userId, t: tenantId || "" });
	const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
		authTagLength: AUTH_TAG_BYTES,
	});
	let encrypted = cipher.update(plaintext, "utf8", "hex");
	encrypted += cipher.final("hex");
	const authTag = cipher.getAuthTag().toString("hex");
	return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/** Decrypt a `sub` produced by `encryptTokenSubject`. Returns null on failure. */
export function decryptTokenSubject(sub: string): {
	userId: string;
	tenantId: string;
} | null {
	if (typeof sub !== "string") return null;
	const parts = sub.split(":");
	if (parts.length !== 3) return null;
	const [ivHex, tagHex, dataHex] = parts;
	if (!isHexOfLength(ivHex, IV_BYTES * 2)) return null;
	if (!isHexOfLength(tagHex, AUTH_TAG_BYTES * 2)) return null;
	if (!dataHex || !/^[0-9a-fA-F]*$/.test(dataHex)) return null;
	try {
		const key = getTokenKey();
		const decipher = crypto.createDecipheriv(
			ALGORITHM,
			key,
			Buffer.from(ivHex, "hex"),
			{ authTagLength: AUTH_TAG_BYTES },
		);
		decipher.setAuthTag(Buffer.from(tagHex, "hex"));
		let decrypted = decipher.update(dataHex, "hex", "utf8");
		decrypted += decipher.final("utf8");
		const parsed = JSON.parse(decrypted) as { u?: unknown; t?: unknown };
		if (
			typeof parsed.u !== "string" ||
			!OBJECT_ID_RE.test(parsed.u)
		) {
			return null;
		}
		const tenantId = typeof parsed.t === "string" ? parsed.t : "";
		if (tenantId !== "" && !OBJECT_ID_RE.test(tenantId)) return null;
		return { userId: parsed.u, tenantId };
	} catch {
		return null;
	}
}

/**
 * Resolve `{ userId, tenantId }` from a verified JWT payload.
 * Supports new opaque `{ sub }` tokens and legacy `{ userId, tenantId }`
 * tokens (accepted during rollout so existing sessions keep working).
 */
export function resolveTokenIdentity(decoded: any): {
	userId: string;
	tenantId: string;
} | null {
	if (!decoded || typeof decoded !== "object") return null;
	if (typeof decoded.sub === "string") {
		// New opaque token — do not fall back to legacy fields.
		return decryptTokenSubject(decoded.sub);
	}
	if (
		typeof decoded.userId === "string" &&
		OBJECT_ID_RE.test(decoded.userId)
	) {
		const tenantId =
			typeof decoded.tenantId === "string" ? decoded.tenantId : "";
		if (tenantId === "" || OBJECT_ID_RE.test(tenantId)) {
			return { userId: decoded.userId, tenantId };
		}
	}
	return null;
}
