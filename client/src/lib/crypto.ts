/**
 * FlowDesk E2EE — WebCrypto suite for conversation encryption.
 *
 * Threat model: the server stores only ciphertext. Message bodies and chat
 * attachments are unreadable server-side; metadata (who/when) stays visible.
 *
 * Design:
 *  - Per-device ECDH P-256 identity keypair. Private JWK never leaves the
 *    browser profile (IndexedDB; optionally OS-encrypted via Electron
 *    safeStorage). Public JWK is published to /auth/devices.
 *  - Per-conversation AES-256-GCM key (raw 32 bytes), created lazily by the
 *    first participant to open the conversation.
 *  - The conversation key is distributed as "wraps": each entry is encrypted
 *    under an ephemeral-static ECDH shared secret
 *      KEK = ECDH(ephemeralPriv, recipientDevicePub)
 *      ct  = base64(iv(12) || AES-GCM(KEK, rawConvKey))
 *    Wraps are self-contained — unwrapping needs no extra lookups.
 *  - Self-healing: after unwrapping, the client re-wraps the key for the
 *    owner's OTHER registered devices that are still missing one.
 *  - Legacy rows/messages without an `iv` are treated as plaintext.
 */
import api from "./api";

/* ------------------------------------------------------------------ */
/* Small utils                                                         */
/* ------------------------------------------------------------------ */

/** Last failure reason — surfaced by toasts and e2eeDiagnostics(). */
let lastError = "";

export function getLastError(): string {
    return lastError;
}

function fail(reason: string): string {
    lastError = reason;
    console.error("[E2EE]", reason);
    return reason;
}

const subtle = () => {
    if (typeof window === "undefined" || !window.isSecureContext) {
        throw new Error(
            "Page is not a secure context — WebCrypto requires HTTPS. E2EE cannot run."
        );
    }
    if (typeof crypto === "undefined" || !crypto.subtle) {
        throw new Error(
            "WebCrypto unavailable in this browser. E2EE cannot run."
        );
    }
    return crypto.subtle;
};

export function bufToB64(buf: ArrayBuffer | Uint8Array): string {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as unknown as number[]);
    }
    return btoa(bin);
}

export function b64ToBuf(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
}

function randomBytes(n: number): Uint8Array {
    const out = new Uint8Array(n);
    crypto.getRandomValues(out);
    return out;
}

function toHex(buf: ArrayBuffer | Uint8Array): string {
    return Array.from(
        buf instanceof Uint8Array ? buf : new Uint8Array(buf)
    )
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

/** Human-friendly safety number: XX:XX:XX ... (first 10 bytes). */
export function fingerprintHex(hex: string): string {
    return (
        hex
            .slice(0, 20)
            .match(/.{2}/g)
            ?.join(":")
            .toUpperCase() ?? hex
    );
}

/* ------------------------------------------------------------------ */
/* Identity (per-device keypair)                                       */
/* ------------------------------------------------------------------ */

interface StoredIdentity {
    id: "identity";
    deviceId: string;
    privateKeyJwk: JsonWebKey;
    publicKeyJwk: JsonWebKey;
}

let identityPromise: Promise<Identity | null> | null = null;

export interface Identity {
    deviceId: string;
    publicKeyJwk: JsonWebKey;
    privateKey: CryptoKey;
    /** Raw public JWK string — what we publish to the server. */
    publicKeyJson: string;
}

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open("flowdesk-e2ee", 1);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains("keys")) {
                req.result.createObjectStore("keys", { keyPath: "id" });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function idbGet<T>(key: string): Promise<T | null> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("keys", "readonly");
        const req = tx.objectStore("keys").get(key);
        req.onsuccess = () => resolve((req.result as T) ?? null);
        req.onerror = () => reject(req.error);
    });
}

async function idbPut(value: unknown): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("keys", "readwrite");
        tx.objectStore("keys").put(value);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function importPrivateEcdh(jwk: JsonWebKey): Promise<CryptoKey> {
    return subtle().importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, [
        "deriveKey",
        "deriveBits",
    ]);
}

export async function importPublicEcdh(pubJwkJson: string): Promise<CryptoKey> {
    return subtle().importKey(
        "jwk",
        JSON.parse(pubJwkJson),
        { name: "ECDH", namedCurve: "P-256" },
        false,
        []
    );
}

async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
    return subtle().importKey("raw", raw as unknown as BufferSource, { name: "AES-GCM" }, false, [
        "encrypt",
        "decrypt",
    ]);
}

async function persistIdentity(identity: StoredIdentity): Promise<void> {
    await idbPut(identity);
    // Best-effort OS-encrypted backup when running inside Electron
    try {
        await window.electronAPI?.secureSave?.(
            "flowdesk-e2ee-identity",
            JSON.stringify({
                deviceId: identity.deviceId,
                privateKeyJwk: identity.privateKeyJwk,
                publicKeyJwk: identity.publicKeyJwk,
            })
        );
    } catch {
        /* non-fatal */
    }
}

async function createIdentity(): Promise<StoredIdentity> {
    const pair = await subtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
        "deriveKey",
        "deriveBits",
    ]);
    const privateKeyJwk = await subtle().exportKey("jwk", pair.privateKey);
    const publicKeyJwk = await subtle().exportKey("jwk", pair.publicKey);
    const stored: StoredIdentity = {
        id: "identity",
        deviceId: toHex(crypto.getRandomValues(new Uint8Array(16))),
        privateKeyJwk,
        publicKeyJwk,
    };
    await persistIdentity(stored);
    return stored;
}

async function registerDevice(stored: StoredIdentity): Promise<boolean> {
    const platform =
        (typeof navigator !== "undefined" && navigator.userAgent?.slice(0, 60)) || "unknown";
    try {
        await api.put("/auth/devices", {
            deviceId: stored.deviceId,
            publicKey: JSON.stringify(stored.publicKeyJwk),
            platform,
        });
        return true;
    } catch {
        // retried lazily by ensureConversationKeys; encryption still works locally
        return false;
    }
}

async function restoreFromDesktopBackup(): Promise<StoredIdentity | null> {
    try {
        const raw = await window.electronAPI?.secureRead?.("flowdesk-e2ee-identity");
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed?.privateKeyJwk && parsed?.publicKeyJwk && parsed?.deviceId) {
            const stored: StoredIdentity = {
                id: "identity",
                deviceId: parsed.deviceId,
                privateKeyJwk: parsed.privateKeyJwk,
                publicKeyJwk: parsed.publicKeyJwk,
            };
            await idbPut(stored);
            return stored;
        }
    } catch {
        /* fall through */
    }
    return null;
}

/** Whether /auth/devices currently knows this device (retried lazily). */
let deviceRegistered = false;

async function ensureRegistered(stored: StoredIdentity): Promise<void> {
    if (deviceRegistered) return;
    deviceRegistered = await registerDevice(stored);
}

let storedIdentityRef: StoredIdentity | null = null;

/** Bootstrap (once per session): load/create this device's identity and publish its public key. */
export async function initE2EE(): Promise<Identity | null> {
    if (identityPromise) return identityPromise;
    identityPromise = (async () => {
        try {
            let stored = await idbGet<StoredIdentity>("identity");
            if (!stored || !stored.privateKeyJwk) {
                stored =
                    (await restoreFromDesktopBackup()) ||
                    (await createIdentity());
            }
            storedIdentityRef = stored;
            // Registration MUST complete before any key distribution runs,
            // otherwise the server has no device to wrap keys for.
            await ensureRegistered(stored);
            const privateKey = await importPrivateEcdh(stored.privateKeyJwk);
            return {
                deviceId: stored.deviceId,
                publicKeyJwk: stored.publicKeyJwk,
                privateKey,
                publicKeyJson: JSON.stringify(stored.publicKeyJwk),
            };
        } catch (err: any) {
            fail(`init failed: ${err?.message ?? err}`);
            return null;
        }
    })();
    return identityPromise;
}

export async function getIdentity(): Promise<Identity | null> {
    return initE2EE();
}

/** Display fingerprint of this device's public key. */
export async function getMyFingerprint(): Promise<string | null> {
    const id = await getIdentity();
    if (!id) return null;
    const digest = await subtle().digest(
        "SHA-256",
        new TextEncoder().encode(id.publicKeyJson)
    );
    return fingerprintHex(toHex(digest));
}

/* ------------------------------------------------------------------ */
/* Key wrapping (ephemeral-static ECDH)                                */
/* ------------------------------------------------------------------ */

export interface KeyWrap {
    userId: string;
    deviceId: string;
    /** Ephemeral ECDH public key, JWK JSON string. */
    epk: string;
    /** base64(iv || AES-GCM(rawConvKey)). */
    ct: string;
}

export interface DeviceInfo {
    deviceId: string;
    publicKey: string;
    platform?: string;
}

/** Wrap raw conversation-key bytes for one recipient device. */
export async function wrapKeyForDevice(
    raw: Uint8Array,
    device: DeviceInfo
): Promise<KeyWrap | null> {
    try {
        const recipientPub = await importPublicEcdh(device.publicKey);
        const ephemeral = await subtle().generateKey(
            { name: "ECDH", namedCurve: "P-256" },
            true,
            ["deriveKey"]
        );
        const kek = await subtle().deriveKey(
            { name: "ECDH", public: recipientPub },
            ephemeral.privateKey,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"]
        );
        const iv = randomBytes(12);
        const ct = await subtle().encrypt(
            { name: "AES-GCM", iv: iv as unknown as BufferSource },
            kek,
            raw as unknown as BufferSource
        );
        const epkJwk = await subtle().exportKey("jwk", ephemeral.publicKey);
        return {
            userId: "",
            deviceId: device.deviceId,
            epk: JSON.stringify(epkJwk),
            ct: bufToB64(concatBytes(iv, new Uint8Array(ct))),
        };
    } catch (err) {
        console.error("[E2EE] wrap failed for device", device.deviceId, err);
        return null;
    }
}

/** Unwrap a wrap entry with this device's private key → raw conversation key. */
export async function unwrapWithIdentity(wrap: KeyWrap): Promise<Uint8Array | null> {
    try {
        const id = await getIdentity();
        if (!id) return null;
        const epkPub = await importPublicEcdh(wrap.epk);
        const kek = await subtle().deriveKey(
            { name: "ECDH", public: epkPub },
            id.privateKey,
            { name: "AES-GCM", length: 256 },
            false,
            ["decrypt"]
        );
        const blob = b64ToBuf(wrap.ct);
        const iv = blob.slice(0, 12);
        const ct = blob.slice(12);
        const pt = await subtle().decrypt(
            { name: "AES-GCM", iv: iv as unknown as BufferSource },
            kek,
            ct as unknown as BufferSource
        );
        return new Uint8Array(pt);
    } catch {
        return null;
    }
}

/* ------------------------------------------------------------------ */
/* Conversation keys                                                   */
/* ------------------------------------------------------------------ */

const convKeys = new Map<string, { raw: Uint8Array; key: CryptoKey }>();

async function fetchDevices(userIds: string[]): Promise<Record<string, DeviceInfo[]>> {
    try {
        const { data } = await api.get("/auth/keys", {
            params: { userIds: userIds.join(",") },
        });
        const map: Record<string, DeviceInfo[]> = {};
        for (const u of data.users ?? []) map[String(u._id)] = u.devices ?? [];
        return map;
    } catch {
        return {};
    }
}

async function putWraps(conversationId: string, wraps: KeyWrap[]): Promise<void> {
    try {
        await api.put(`/conversations/${conversationId}/keys`, { wraps });
    } catch (err) {
        console.error("[E2EE] publishing wraps failed:", err);
    }
}

/**
 * Make sure we hold the AES key for this conversation.
 * Returns true when encryption/decryption is possible.
 */
export async function ensureConversationKeys(
    conversationId: string,
    participantIds: string[]
): Promise<boolean> {
    if (convKeys.has(conversationId)) return true;
    const id = await getIdentity();
    if (!id) {
        fail(
            "Identity unavailable — WebCrypto/HTTPS problem. " +
            "E2EE requires the app to be served over HTTPS."
        );
        return false;
    }

    // Registration may have failed earlier in this session (offline blip,
    // race on first login) — retry before doing anything key-related.
    if (storedIdentityRef && !deviceRegistered) {
        try { await ensureRegistered(storedIdentityRef); } catch { /* keep going */ }
    }
    if (!deviceRegistered) {
        fail("Device key could not be registered — PUT /auth/devices keeps failing");
    }

    let wraps: KeyWrap[] = [];
    try {
        const { data } = await api.get(`/conversations/${conversationId}/keys`);
        wraps = data.wraps ?? [];
    } catch (err: any) {
        const status = err?.response?.status;
        if (status === 404 || status === 400) {
            fail(
                `GET /conversations/:id/keys returned ${status} — the SERVER running in this ` +
                "environment is outdated and does not have the E2EE endpoints. Deploy the backend."
            );
        } else if (status === 401 || status === 403) {
            fail(`GET /conversations/:id/keys returned ${status} — auth problem`);
        } else {
            fail(`GET /conversations/:id/keys failed (${status ?? "network error"})`);
        }
        return false;
    }

    // 1) Try to unwrap a wrap addressed to THIS device
    const mine = wraps.filter((w) => w.deviceId === id.deviceId);
    for (const w of mine) {
        const raw = await unwrapWithIdentity(w);
        if (raw && raw.length === 32) {
            convKeys.set(conversationId, { raw, key: await importAesKey(raw) });
            lastError = "";
            // Heal EVERYONE missing wraps (late-registered devices, new
            // participants), not just our own other devices.
            void healMissingWraps(conversationId, raw, participantIds, wraps);
            return true;
        }
    }

    if (participantIds.length === 0) {
        fail("No participants known for this conversation — cannot obtain or mint a key");
        return false;
    }

    // 2) Grace window: another session may be publishing our wrap right now
    await new Promise((r) => setTimeout(r, 600));
    try {
        const { data } = await api.get(`/conversations/${conversationId}/keys`);
        for (const w of ((data.wraps ?? []) as KeyWrap[]).filter(
            (x) => x.deviceId === id.deviceId
        )) {
            const raw = await unwrapWithIdentity(w);
            if (raw && raw.length === 32) {
                convKeys.set(conversationId, { raw, key: await importAesKey(raw) });
                lastError = "";
                void healMissingWraps(conversationId, raw, participantIds, wraps);
                return true;
            }
        }
    } catch { /* fall through to unilateral recovery */ }

    // 3) Unilateral recovery. The stored wraps may point at dead devices
    //    (cleared profiles, reinstalls) that nobody can ever unwrap — waiting
    //    forever helps no one. Mint a FRESH key and append wraps for every
    //    currently-registered device. Holders of an older key keep reading
    //    history under it and converge onto this key the next time they open
    //    the chat (unwrap accepts any entry addressed to them).
    const raw = randomBytes(32);
    convKeys.set(conversationId, { raw, key: await importAesKey(raw) });
    lastError = "";
    void distributeToAll(conversationId, raw, participantIds);
    return true;
}

/**
 * Re-wrap a known raw key for every participant device that is missing one —
 * including other users' late-registered devices.
 */
async function healMissingWraps(
    conversationId: string,
    raw: Uint8Array,
    participantIds: string[],
    existingWraps: KeyWrap[]
): Promise<void> {
    try {
        const deviceMap = await fetchDevices(participantIds);
        const covered = new Set(existingWraps.map((w) => w.deviceId));
        const newWraps: KeyWrap[] = [];
        for (const uid of participantIds) {
            for (const d of deviceMap[uid] ?? []) {
                if (covered.has(d.deviceId)) continue;
                const w = await wrapKeyForDevice(raw, d);
                if (w) newWraps.push({ ...w, userId: uid });
            }
        }
        if (newWraps.length) await putWraps(conversationId, newWraps);
    } catch {
        /* best effort */
    }
}

/** Generate wraps for every device of every participant. */
async function distributeToAll(
    conversationId: string,
    raw: Uint8Array,
    participantIds: string[]
): Promise<void> {
    try {
        const deviceMap = await fetchDevices(participantIds);
        const wraps: KeyWrap[] = [];
        for (const uid of participantIds) {
            for (const d of deviceMap[uid] ?? []) {
                const w = await wrapKeyForDevice(raw, d);
                if (w) wraps.push({ ...w, userId: uid });
            }
        }
        if (wraps.length) await putWraps(conversationId, wraps);
    } catch (err) {
        console.error("[E2EE] distribute failed:", err);
    }
}

/* ------------------------------------------------------------------ */
/* Message payload encryption                                          */
/* ------------------------------------------------------------------ */

export interface EncryptedPayload {
    content: string;
    iv: string;
}

export async function encryptContent(
    conversationId: string,
    plaintext: string
): Promise<EncryptedPayload | null> {
    const entry = convKeys.get(conversationId);
    if (!entry) return null;
    const iv = randomBytes(12);
    const ct = await subtle().encrypt(
        { name: "AES-GCM", iv: iv as unknown as BufferSource },
        entry.key,
        new TextEncoder().encode(plaintext) as unknown as BufferSource
    );
    return { content: bufToB64(ct), iv: bufToB64(iv) };
}

/**
 * Decrypt message content. Legacy messages (no iv) pass through untouched;
 * undecryptable rows render as a lock placeholder instead of failing hard.
 */
export async function decryptContent(
    conversationId: string,
    content: string,
    iv?: string | null
): Promise<string> {
    if (!iv) return content; // legacy plaintext
    const entry = convKeys.get(conversationId);
    if (!entry) return "\u{1F512} Encrypted message (key unavailable)";
    try {
        const pt = await subtle().decrypt(
            { name: "AES-GCM", iv: b64ToBuf(iv) as unknown as BufferSource },
            entry.key,
            b64ToBuf(content) as unknown as BufferSource
        );
        return new TextDecoder().decode(pt);
    } catch {
        return "\u{1F512} Encrypted message";
    }
}

/* ------------------------------------------------------------------ */
/* File encryption                                                     */
/* ------------------------------------------------------------------ */

export interface EncryptedFileResult {
    /** Ciphertext bytes to upload. */
    data: ArrayBuffer;
    /** JSON payload for the server: { encIv, encKey }. */
    encMeta: string;
}

/**
 * Encrypt a file with a fresh random AES key, then wrap that key under the
 * conversation key. Server receives opaque bytes + wrapped key material.
 */
export async function encryptFileForConversation(
    conversationId: string,
    file: File
): Promise<EncryptedFileResult | null> {
    const entry = convKeys.get(conversationId);
    if (!entry) return null;

    const fileKeyRaw = randomBytes(32);
    const fileKey = await importAesKey(fileKeyRaw);
    const fileIv = randomBytes(12);

    const plaintext = await file.arrayBuffer();
    const ciphertext = await subtle().encrypt(
        { name: "AES-GCM", iv: fileIv as unknown as BufferSource },
        fileKey,
        plaintext
    );

    // Wrap per-file key under the conversation key
    const wrapIv = randomBytes(12);
    const wrapped = await subtle().encrypt(
        { name: "AES-GCM", iv: wrapIv as unknown as BufferSource },
        entry.key,
        fileKeyRaw as unknown as BufferSource
    );

    return {
        data: ciphertext,
        encMeta: JSON.stringify({
            encIv: bufToB64(fileIv),
            encKey: bufToB64(concatBytes(wrapIv, new Uint8Array(wrapped))),
        }),
    };
}

/** Raw decrypt of an encrypted attachment → plaintext bytes. */
export async function decryptAttachmentToBuffer(
    conversationId: string,
    arrayBuffer: ArrayBuffer,
    encIv?: string | null,
    encKey?: string | null
): Promise<ArrayBuffer> {
    const entry = convKeys.get(conversationId);
    if (!entry) throw new Error("Conversation key unavailable");
    if (!encIv || !encKey) return arrayBuffer; // legacy plaintext passthrough
    const kb = b64ToBuf(encKey);
    const wrapIv = kb.slice(0, 12);
    const wrapped = kb.slice(12);
    const fileKeyRaw = await subtle().decrypt(
        { name: "AES-GCM", iv: wrapIv as unknown as BufferSource },
        entry.key,
        wrapped as unknown as BufferSource
    );
    const fileKey = await subtle().importKey(
        "raw",
        fileKeyRaw,
        { name: "AES-GCM" },
        false,
        ["decrypt"]
    );
    const pt = await subtle().decrypt(
        { name: "AES-GCM", iv: b64ToBuf(encIv) as unknown as BufferSource },
        fileKey,
        arrayBuffer
    );
    return pt;
}

/**
 * Decrypt an encrypted attachment → object URL (in-memory blob only).
 * Returns null for legacy plaintext attachments (no encIv).
 */
export async function decryptAttachmentToObjectUrl(
    conversationId: string,
    arrayBuffer: ArrayBuffer,
    encIv?: string | null,
    encKey?: string | null,
    mime = "application/octet-stream"
): Promise<string | null> {
    if (!encIv || !encKey) return null; // legacy — caller falls back to direct URL
    try {
        const pt = await decryptAttachmentToBuffer(conversationId, arrayBuffer, encIv, encKey);
        return URL.createObjectURL(new Blob([pt], { type: mime }));
    } catch (err) {
        console.error("[E2EE] attachment decrypt failed:", err);
        return null;
    }
}

/** Fetch + decrypt an encrypted attachment, returning a temporary object URL. */
export async function getDecryptedAttachmentUrl(
    conversationId: string,
    url: string,
    encIv?: string | null,
    encKey?: string | null,
    mime = "application/octet-stream"
): Promise<string | null> {
    if (!encIv || !encKey) return null;
    const resp = await fetch(url, { credentials: "include" });
    if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
    const buf = await resp.arrayBuffer();
    return decryptAttachmentToObjectUrl(conversationId, buf, encIv, encKey, mime);
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

let cachedMeId: string | null = null;

export async function meUserId(): Promise<string | null> {
    if (cachedMeId) return cachedMeId;
    try {
        const { data } = await api.get("/auth/me");
        cachedMeId = String(data.user?._id ?? data._id ?? "");
        return cachedMeId || null;
    } catch {
        return null;
    }
}

/** Safety number across all participants' device keys (sorted, hashed). */
export async function getConversationSafetyNumber(
    participantPublicKeys: string[]
): Promise<string | null> {
    if (!participantPublicKeys.length) return null;
    const digest = await subtle().digest(
        "SHA-256",
        new TextEncoder().encode([...participantPublicKeys].sort().join("|"))
    );
    return fingerprintHex(toHex(digest));
}

/* ------------------------------------------------------------------ */
/* Diagnostics                                                         */
/* ------------------------------------------------------------------ */

/** One-shot health report for the E2EE subsystem (browser console aid). */
export async function e2eeDiagnostics() {
    const secure = typeof window !== "undefined" ? window.isSecureContext : false;
    const subtleOk =
        secure && typeof crypto !== "undefined" && !!crypto.subtle;
    const id = subtleOk ? await initE2EE().catch(() => null) : null;
    let deviceCheck: string = "skipped";
    if (id) {
        try {
            const { data } = await api.get("/auth/keys");
            const me = data.users?.[0];
            const found = (me?.devices ?? []).some(
                (d: any) => d.deviceId === id.deviceId
            );
            deviceCheck = found
                ? "registered"
                : "NOT registered on server";
        } catch (err: any) {
            deviceCheck = `GET /auth/keys failed (${err?.response?.status ?? err?.message})`;
        }
    }
    return {
        isSecureContext: secure,
        webCryptoAvailable: subtleOk,
        identityLoaded: !!id,
        deviceId: id?.deviceId ?? null,
        deviceRegistration: deviceCheck,
        conversationsWithKeys: convKeys.size,
        lastError: getLastError(),
        hint:
            !subtleOk
                ? "Serve the app over HTTPS � crypto.subtle is unavailable otherwise."
                : !id
                    ? "Identity bootstrap failed � check IndexedDB availability."
                    : deviceCheck.includes("failed")
                        ? "Backend endpoints missing? Deploy the updated server."
                        : "Looks OK client-side; check server logs.",
    };
}

if (typeof window !== "undefined") {
    (window as any).__e2eeDiagnostics = e2eeDiagnostics;
}
