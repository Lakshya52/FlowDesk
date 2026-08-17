import { io } from '../index';

export const emitTaskCreated = (tenantId: string, task: any) => {
    io.to(`tenant_${tenantId}`).emit('task:created', task);
};

export const emitTaskUpdated = (tenantId: string, task: any) => {
    io.to(`tenant_${tenantId}`).emit('task:updated', task);
};

export const emitTaskDeleted = (tenantId: string, taskId: string) => {
    io.to(`tenant_${tenantId}`).emit('task:deleted', { taskId });
};

export const emitBoardUpdated = (tenantId: string, board: any) => {
    io.to(`tenant_${tenantId}`).emit('board:updated', board);
};

export const emitBoardCreated = (tenantId: string, board: any) => {
    io.to(`tenant_${tenantId}`).emit('board:created', board);
};

export const emitBoardDeleted = (tenantId: string, boardId: string) => {
    io.to(`tenant_${tenantId}`).emit('board:deleted', { boardId });
};
