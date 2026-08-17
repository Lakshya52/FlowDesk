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
    cb(new Error(`File type "${file.mimetype}" (${ext}) is not allowed`));
  }
};

export const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 52428800, // 50MB in bytes
    },
});
