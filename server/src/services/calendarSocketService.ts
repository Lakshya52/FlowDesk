import { io } from '../index';

export const emitCalendarEventCreated = (tenantId: string, event: any) => {
    io.to(`tenant_${tenantId}`).emit('calendar-event:created', event);
};

export const emitCalendarEventUpdated = (tenantId: string, event: any) => {
    io.to(`tenant_${tenantId}`).emit('calendar-event:updated', event);
};

export const emitCalendarEventDeleted = (tenantId: string, eventId: string) => {
    io.to(`tenant_${tenantId}`).emit('calendar-event:deleted', { eventId });
};

export const emitCalendarCreated = (tenantId: string, calendar: any) => {
    io.to(`tenant_${tenantId}`).emit('calendar:created', calendar);
};

export const emitCalendarUpdated = (tenantId: string, calendar: any) => {
    io.to(`tenant_${tenantId}`).emit('calendar:updated', calendar);
};

export const emitCalendarDeleted = (tenantId: string, calendarId: string) => {
    io.to(`tenant_${tenantId}`).emit('calendar:deleted', { calendarId });
};
