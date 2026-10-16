import Attachment from '../models/Attachment';
import User from '../models/User';
import Partner from '../models/Partner';
import FieldVisit from '../models/FieldVisit';
import Conversation from '../models/Conversation';

export type FileAccess = 'ok' | 'not-found' | 'forbidden';

const stripPrefix = (v: string): string => v.replace(/^\/uploads\//, '');

const INVALID = /[\\/]|^\.|\.\./;

const tenantOf = (user: any): string =>
    (user?.tenantId?._id || user?.tenantId)?.toString();

/**
 * Resolves whether the requesting user may download a GridFS file.
 * Matches the stored filename against every collection that references
 * uploads and compares tenants (or conversation participation).
 */
export async function checkFileAccess(
    rawFilename: string,
    reqUser: any,
): Promise<FileAccess> {
    const filename = stripPrefix(String(rawFilename || ''));
    if (!filename || INVALID.test(filename)) return 'not-found';

    const reqTenant = tenantOf(reqUser);
    const reqUserId = reqUser?._id?.toString();

    // Task / chat / conversation attachments → uploader's tenant
    const attachment = await Attachment.findOne({ fileName: filename })
        .populate('uploadedBy', 'tenantId')
        .lean();
    if (attachment) {
        const owner = (attachment.uploadedBy as any)?.tenantId?.toString();
        return owner && reqTenant && owner === reqTenant ? 'ok' : 'forbidden';
    }

    // User avatars
    const user = await User.findOne({
        $or: [{ avatar: filename }, { avatar: `/uploads/${filename}` }],
    })
        .select('tenantId')
        .lean();
    if (user) {
        const owner = (user.tenantId as any)?.toString();
        return owner && reqTenant && owner === reqTenant ? 'ok' : 'forbidden';
    }

    // Partner agreements
    const partner = await Partner.findOne({ agreementFileName: filename })
        .select('tenantId')
        .lean();
    if (partner) {
        const owner = (partner.tenantId as any)?.toString();
        return owner && reqTenant && owner === reqTenant ? 'ok' : 'forbidden';
    }

    // Field-visit selfies / receipts (stored as raw filenames, sometimes with prefix)
    const prefixed = `/uploads/${filename}`;
    const visit = await FieldVisit.findOne({
        $or: [
            { checkInSelfie: { $in: [filename, prefixed] } },
            { checkOutSelfie: { $in: [filename, prefixed] } },
            { digitalSignature: { $in: [filename, prefixed] } },
            { 'expenses.receiptImage': { $in: [filename, prefixed] } },
        ],
    })
        .select('tenantId')
        .lean();
    if (visit) {
        const owner = (visit.tenantId as any)?.toString();
        return owner && reqTenant && owner === reqTenant ? 'ok' : 'forbidden';
    }

    // Conversation avatars → any participant may view
    const conversation = await Conversation.findOne({
        $or: [{ avatar: filename }, { avatar: `/uploads/${filename}` }],
    })
        .select('participants')
        .lean();
    if (conversation) {
        const isParticipant = ((conversation.participants as any[]) || []).some(
            (p) => p.toString() === reqUserId,
        );
        return isParticipant ? 'ok' : 'forbidden';
    }

    return 'not-found';
}
