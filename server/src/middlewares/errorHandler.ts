import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
    statusCode?: number;
    isOperational?: boolean;
}

export const errorHandler = (err: AppError, _req: Request, res: Response, _next: NextFunction): void => {
    // Multer upload errors (e.g. LIMIT_FILE_SIZE) are client errors, not 500s.
    if (err.name === 'MulterError') {
        const message =
            (err as any).code === 'LIMIT_FILE_SIZE'
                ? 'File exceeds the 50 MB size limit'
                : err.message || 'File upload failed';
        res.status(400).json({ status: 'error', statusCode: 400, message });
        return;
    }

    const statusCode = err.statusCode || 500;
    const message = err.isOperational ? err.message : 'Internal server error';

    if (process.env.NODE_ENV !== 'production') {
        console.error('Error:', err);
    }

    res.status(statusCode).json({
        status: 'error',
        statusCode,
        message,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    });
};

export const notFound = (_req: Request, res: Response): void => {
    res.status(404).json({ status: 'error', message: 'Route not found' });
};

export const createError = (message: string, statusCode: number): AppError => {
    const error = new Error(message) as AppError;
    error.statusCode = statusCode;
    error.isOperational = true;
    return error;
};
