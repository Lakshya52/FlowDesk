import mongoose from 'mongoose';
import Attachment from '../models/Attachment';
import User from '../models/User';
import Partner from '../models/Partner';
import FieldVisit from '../models/FieldVisit';
import Conversation from '../models/Conversation';
import { deleteFromGridFS } from '../utils/gridfs';

const GRACE_DAYS = Math.max(1, parseInt(process.env.ORPHAN_SWEEP_GRACE_DAYS || '7', 10) || 7);
// Dry-run unless explicitly disabled: logs what would be deleted.
const DRY_RUN = (process.env.ORPHAN_SWEEP_DRY_RUN || 'true').toLowerCase() !== 'false';

const stripPrefix = (v: any): string => String(v || '').replace(/^\/uploads\//, '');

// Only plausible GridFS filenames (our uploads are `<ts>-<rand><ext>`).
// Filters out base64 data URLs (signatures) and absolute paths.
const isFilenameLike = (v: any): boolean => {
    const s = String(v || '');
    return !!s && s.length < 128 && !s.includes('/') && !s.includes('\\') && !s.includes(';') && !s.includes(',');
};

let timer: ReturnType<typeof setTimeout> | null = null;

const collectReferenced = async (): Promise<Set<string>> => {
    const referenced = new Set<string>();
    const add = (v: any) => {
        const name = stripPrefix(v);
        if (isFilenameLike(name)) referenced.add(name);
    };

    const [attachments, avatars, agreements, visits, convAvatars] = await Promise.all([
        Attachment.find({}).select('fileName').lean(),
        User.find({}).select('avatar').lean(),
        Partner.find({}).select('agreementFileName').lean(),
        FieldVisit.find({}).select('checkInSelfie checkOutSelfie digitalSignature expenses.receiptImage').lean(),
        Conversation.find({}).select('avatar').lean(),
    ]);

    attachments.forEach((a: any) => add(a.fileName));
    avatars.forEach((u: any) => add(u.avatar));
    agreements.forEach((p: any) => add(p.agreementFileName));
    convAvatars.forEach((c: any) => add(c.avatar));
    visits.forEach((v: any) => {
        add(v.checkInSelfie);
        add(v.checkOutSelfie);
        add(v.digitalSignature);
        ((v.expenses as any[]) || []).forEach((e) => add(e?.receiptImage));
    });

    return referenced;
};

export const runOrphanSweep = async (): Promise<{ scanned: number; orphaned: number; deleted: number }> => {
    if (!mongoose.connection.db) {
        console.log('[ORPHAN-SWEEP] Skipped: database not connected');
        return { scanned: 0, orphaned: 0, deleted: 0 };
    }

    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
        bucketName: 'uploads',
    });

    const files = await bucket.find({}).toArray();
    const referenced = await collectReferenced();
    const cutoff = Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000;

    let orphaned = 0;
    let deleted = 0;
    for (const f of files) {
        if (referenced.has(f.filename)) continue;
        const uploadedAt = (f as any).uploadDate ? new Date((f as any).uploadDate).getTime() : 0;
        if (uploadedAt > cutoff) continue; // grace period for in-flight uploads
        orphaned++;
        if (DRY_RUN) {
            console.log(`[ORPHAN-SWEEP] [dry-run] would delete ${f.filename} (${(f as any).length ?? 0} bytes)`);
        } else {
            try {
                await bucket.delete(f._id);
                deleted++;
            } catch (err) {
                console.error(`[ORPHAN-SWEEP] Failed to delete ${f.filename}:`, err);
            }
        }
    }

    console.log(
        `[ORPHAN-SWEEP] Done: scanned=${files.length} orphaned=${orphaned} deleted=${deleted} dryRun=${DRY_RUN}`,
    );
    return { scanned: files.length, orphaned, deleted };
};

const msUntilNext3AM = (): number => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(3, 0, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    return next.getTime() - now.getTime();
};

const scheduleNext = () => {
    if (timer) {
        clearTimeout(timer);
        timer = null;
    }
    const delay = msUntilNext3AM();
    console.log(`[ORPHAN-SWEEP] Next run in ${Math.round(delay / 3600000)}h (dryRun=${DRY_RUN})`);
    timer = setTimeout(async () => {
        try {
            await runOrphanSweep();
        } catch (err) {
            console.error('[ORPHAN-SWEEP] Error:', err);
        } finally {
            scheduleNext();
        }
    }, delay);
};

export const startOrphanSweeper = () => {
    scheduleNext();
};

export const stopOrphanSweeper = () => {
    if (timer) {
        clearTimeout(timer);
        timer = null;
    }
};
