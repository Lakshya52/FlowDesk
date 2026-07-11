import FieldVisit from '../models/FieldVisit';
import { emitFieldVisitTrackingLost, emitFieldVisitTrackingRestored } from './fieldVisitSocketService';

const STALE_AFTER_MS = 5 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 1000;

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export const startFieldVisitHeartbeat = () => {
    runHeartbeatCheck();
    intervalHandle = setInterval(runHeartbeatCheck, CHECK_INTERVAL_MS);
    console.log('[Heartbeat] Field visit tracking heartbeat started (interval: 60s, stale after: 5min)');
};

export const stopFieldVisitHeartbeat = () => {
    if (intervalHandle) {
        clearInterval(intervalHandle);
        intervalHandle = null;
    }
};

async function runHeartbeatCheck() {
    try {
        const cutoff = new Date(Date.now() - STALE_AFTER_MS);

        // Find active visits that are too old without location update
        const staleVisits = await FieldVisit.find({
            status: 'checked_in',
            $and: [
                { $or: [
                    { lastLocationUpdateAt: { $lt: cutoff } },
                    { lastLocationUpdateAt: { $exists: false } },
                ]},
                { trackingStartedAt: { $lt: cutoff } },
            ],
        }).populate('employeeId', 'name employeeId').lean();

        for (const visit of staleVisits) {
            if (visit.trackingLost) continue;

            const emp = visit.employeeId as any;
            await FieldVisit.updateOne(
                { _id: visit._id },
                { $set: { trackingLost: true } }
            );

            emitFieldVisitTrackingLost(
                (visit.tenantId as any).toString(),
                {
                    visitId: visit._id.toString(),
                    employeeId: (emp?._id || visit.employeeId).toString(),
                    employeeName: emp?.name || 'Unknown',
                }
            );
        }

        // Find visits where tracking was lost but is now restored
        const restoredVisits = await FieldVisit.find({
            status: 'checked_in',
            trackingLost: true,
            lastLocationUpdateAt: { $gte: cutoff },
        }).populate('employeeId', 'name employeeId').lean();

        for (const visit of restoredVisits) {
            const emp = visit.employeeId as any;
            await FieldVisit.updateOne(
                { _id: visit._id },
                { $set: { trackingLost: false } }
            );

            emitFieldVisitTrackingRestored(
                (visit.tenantId as any).toString(),
                {
                    visitId: visit._id.toString(),
                    employeeId: (emp?._id || visit.employeeId).toString(),
                    employeeName: emp?.name || 'Unknown',
                }
            );
        }

        if (staleVisits.length > 0 || restoredVisits.length > 0) {
            console.log(`[Heartbeat] Marked ${staleVisits.length} visits as tracking lost, ${restoredVisits.length} restored`);
        }
    } catch (error) {
        console.error('[Heartbeat] Error in heartbeat check:', error);
    }
}
