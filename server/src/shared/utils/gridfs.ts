import mongoose from 'mongoose';
import path from 'path';
import { Readable } from 'stream';

/**
 * Uploads a file buffer to MongoDB GridFS.
 * Returns the generated filename for storage reference.
 */
export async function uploadToGridFS(
    fileBuffer: Buffer,
    originalName: string,
    mimetype: string
): Promise<{ filename: string }> {
    if (!mongoose.connection.db) {
        throw new Error('Database connection not established');
    }

    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
        bucketName: 'uploads',
    });

    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const filename = `${uniqueSuffix}${path.extname(originalName)}`;

    return new Promise((resolve, reject) => {
        const uploadStream = bucket.openUploadStream(filename, {
            contentType: mimetype,
        });

        const readableStream = new Readable();
        readableStream.push(fileBuffer);
        readableStream.push(null);

        readableStream
            .pipe(uploadStream)
            .on('finish', () => {
                resolve({ filename });
            })
            .on('error', (err) => {
                reject(err);
            });
    });
}

/**
 * Deletes a file from GridFS by its filename.
 */
export async function deleteFromGridFS(filename: string): Promise<void> {
    if (!mongoose.connection.db) return;

    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
        bucketName: 'uploads',
    });

    const files = await bucket.find({ filename }).toArray();
    if (files && files.length > 0) {
        await bucket.delete(files[0]._id);
    }
}
