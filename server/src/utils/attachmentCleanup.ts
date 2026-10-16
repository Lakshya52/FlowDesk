import Attachment from '../models/Attachment';
import { deleteFromGridFS } from './gridfs';

/**
 * Deletes Attachment documents matching `filter` along with their
 * GridFS bytes. Best-effort: a single file failure never blocks the rest.
 * Returns the number of Attachment documents removed.
 */
export const deleteAttachmentsFor = async (
    filter: Record<string, any>,
): Promise<number> => {
    const docs = await Attachment.find(filter).select('_id fileName').lean();
    for (const doc of docs) {
        const fileName = (doc as any).fileName;
        if (!fileName) continue;
        try {
            await deleteFromGridFS(fileName);
        } catch (err) {
            console.error(`[ATTACHMENT-CLEANUP] Failed to delete ${fileName}:`, err);
        }
    }
    if (docs.length > 0) {
        await Attachment.deleteMany({ _id: { $in: docs.map((d) => d._id) } });
    }
    return docs.length;
};
