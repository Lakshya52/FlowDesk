import multer from 'multer';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

// Use memory storage - files are held in buffer, then manually written to GridFS in controllers
const storage = multer.memoryStorage();

const ALLOWED_MIMES = [
  // Images
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  // Spreadsheets
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  // Videos
  'video/mp4', 'video/webm', 'video/quicktime',
  // Archives
  'application/zip', 'application/x-rar-compressed',
  // Presentations
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // E2EE: encrypted file uploads are always sent as ciphertext (octet-stream)
  'application/octet-stream',
];


const ALLOWED_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
  '.pdf', '.doc', '.docx', '.txt',
  '.xls', '.xlsx', '.csv',
  '.mp4', '.webm', '.mov',
  '.zip', '.rar',
  '.ppt', '.pptx',
];


// v1
// const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
//     // Allow all file types as of now
//     cb(null, true);
// };

// v2
// const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
//   if (ALLOWED_MIMES.includes(file.mimetype)) {
//     cb(null, true);
//   } else {
//     cb(new Error(`File type "${file.mimetype}" is not allowed`), false);
//   }
// };

// v3
const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_MIMES.includes(file.mimetype) && ALLOWED_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    // Operational 400 (not a 500): the global errorHandler turns this into a
    // clean JSON response so the client fails fast instead of hanging.
    const err = new Error(`File type "${file.mimetype}" (${ext || 'no extension'}) is not allowed`) as Error & { statusCode?: number; isOperational?: boolean };
    err.statusCode = 400;
    err.isOperational = true;
    cb(err);
  }
};

// Images only (avatars, selfies, receipts, signatures)
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

const imageFileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (IMAGE_MIMES.includes(file.mimetype) && IMAGE_EXTS.includes(ext)) {
    cb(null, true);
  } else {
    const err = new Error(`Only image files (JPG, PNG, GIF, WEBP) are allowed (got "${file.originalname}")`) as Error & { statusCode?: number; isOperational?: boolean };
    err.statusCode = 400;
    err.isOperational = true;
    cb(err);
  }
};

const makeUpload = (maxMB: number, filter: multer.Options['fileFilter']) =>
  multer({
    storage,
    fileFilter: filter as any,
    limits: { fileSize: maxMB * 1024 * 1024 },
  });

export const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 52428800, // 50MB in bytes (Excel/import routes)
    },
});

// Avatars: small square images
export const uploadAvatar = makeUpload(2, imageFileFilter);

// Camera photos: selfies, receipts, signatures
export const uploadImage = makeUpload(8, imageFileFilter);

// Documents & media: task files, chat/conversation files, partner agreements
export const uploadDoc = makeUpload(25, fileFilter);
