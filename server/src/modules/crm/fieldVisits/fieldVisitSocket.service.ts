import { io } from '../../../index';

export const emitFieldVisitCheckedIn = (tenantId: string, visit: any) => {
    io.to(`tenant_${tenantId}`).emit("field-visit:checked-in", visit);
};

export const emitFieldVisitCheckedOut = (tenantId: string, visit: any) => {
    io.to(`tenant_${tenantId}`).emit("field-visit:checked-out", visit);
};

export const emitFieldVisitLocation = (tenantId: string, data: { visitId: string; employeeId: string; lat: number; lng: number; timestamp: string }) => {
    io.to(`tenant_${tenantId}`).emit("field-visit:location", data);
};

export const emitFieldVisitBreached = (tenantId: string, data: { visitId: string; employeeId: string; employeeName: string }) => {
    io.to(`tenant_${tenantId}`).emit("field-visit:geo-breached", data);
};

export const emitFieldVisitCreated = (tenantId: string, visit: any) => {
    io.to(`tenant_${tenantId}`).emit("field-visit:created", visit);
};

export const emitFieldVisitUpdated = (tenantId: string, visit: any) => {
    io.to(`tenant_${tenantId}`).emit("field-visit:updated", visit);
};

export const emitFieldVisitCancelled = (tenantId: string, visitId: string) => {
    io.to(`tenant_${tenantId}`).emit("field-visit:cancelled", visitId);
};

export const emitFieldVisitTrackingLost = (tenantId: string, data: { visitId: string; employeeId: string; employeeName: string }) => {
    io.to(`tenant_${tenantId}`).emit("field-visit:tracking-lost", data);
};

export const emitFieldVisitTrackingRestored = (tenantId: string, data: { visitId: string; employeeId: string; employeeName: string }) => {
    io.to(`tenant_${tenantId}`).emit("field-visit:tracking-restored", data);
};

export const emitFieldVisitCompleted = (tenantId: string, data: { visitId: string; clientName: string; employeeName: string }) => {
    io.to(`tenant_${tenantId}`).emit("field-visit:completed", data);
};
