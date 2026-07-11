import { Response } from "express";
import mongoose from "mongoose";
import FieldVisit from "../models/FieldVisit";
import LocationTrack from "../models/LocationTrack";
import Company from "../models/Company";
import Lead from "../models/Lead";
import Campaign from "../models/Campaign";
import Tenant from "../models/Tenant";
import { AuthRequest } from "../middlewares/auth";
import { uploadToGridFS } from "../utils/gridfs";
import {
    emitFieldVisitCheckedIn,
    emitFieldVisitCheckedOut,
    emitFieldVisitLocation,
    emitFieldVisitBreached,
    emitFieldVisitCreated,
    emitFieldVisitUpdated,
    emitFieldVisitCancelled,
    emitFieldVisitTrackingRestored,
    emitFieldVisitCompleted,
} from "../services/fieldVisitSocketService";

const getTenantId = (user: any): string =>
    (user.tenantId?._id || user.tenantId).toString();

export const createFieldVisit = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user);
        const user = req.user!;
        const { clientId, clientType, scheduledDate, scheduledTime, clientName, employeeId } = req.body;

        if (!clientId || !clientType) {
            res.status(400).json({ message: "clientId and clientType are required" });
            return;
        }

        let targetEmployee = user._id;
        const isScheduled = !!(scheduledDate || scheduledTime) && (user.role === 'admin' || user.role === 'manager');

        if (employeeId && (user.role === 'admin' || user.role === 'manager')) {
            targetEmployee = employeeId;
        }

        const tenant = await Tenant.findById(tenantId).select('settings');
        const geoFenceRadius = tenant?.settings?.geoFenceRadius ?? 100;

        const visit = await FieldVisit.create({
            tenantId,
            employeeId: targetEmployee,
            clientId,
            clientType,
            clientName: clientName || '',
            scheduledDate: scheduledDate || undefined,
            scheduledTime: scheduledTime || undefined,
            geoFenceRadius,
        });

        emitFieldVisitCreated(tenantId, visit);
        res.status(201).json({ success: true, visit });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getFieldVisits = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user);
        const user = req.user!;
        const { status, outcome, employeeId, clientId, startDate, endDate, visitType, page: p, limit: l } = req.query;
        const page = Math.max(1, parseInt(p as string) || 1);
        const limit = Math.min(100000, Math.max(1, parseInt(l as string) || 20));
        const skip = (page - 1) * limit;

        const filter: any = { tenantId };

        if (user.role === 'member') {
            filter.employeeId = user._id;
        } else if (employeeId) {
            filter.employeeId = employeeId;
        }

        if (status) filter.status = status;
        if (outcome) filter.outcome = outcome;
        if (clientId) filter.clientId = clientId;

        if (visitType === 'scheduled') {
            filter.scheduledDate = { $exists: true, $ne: null };
        } else if (visitType === 'unscheduled') {
            filter.scheduledDate = { $exists: false };
        }

        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate as string);
            if (endDate) filter.createdAt.$lte = new Date(endDate as string);
        }

        const [visits, total] = await Promise.all([
            FieldVisit.find(filter)
                .populate('employeeId', 'name email avatar employeeId')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            FieldVisit.countDocuments(filter),
        ]);

        res.json({
            success: true,
            visits,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getFieldVisit = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user);
        const visit = await FieldVisit.findOne({ _id: req.params.id, tenantId })
            .populate('employeeId', 'name email avatar employeeId')
            .populate('clientId', 'name phone companyName city state addressLine')
            .lean();

        if (!visit) {
            res.status(404).json({ message: "Field visit not found" });
            return;
        }

        res.json({ success: true, visit });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const updateFieldVisit = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user);
        const allowed = ['scheduledDate', 'scheduledTime', 'clientName', 'visitOrder', 'remarks'];
        const updates: any = {};
        for (const key of allowed) {
            if (req.body[key] !== undefined) updates[key] = req.body[key];
        }

        const filter: any = { _id: req.params.id, tenantId };
        if (req.user!.role === 'member') filter.employeeId = req.user!._id;

        const visit = await FieldVisit.findOneAndUpdate(
            filter,
            { $set: updates },
            { new: true }
        );

        if (!visit) {
            res.status(404).json({ message: "Visit not found or cannot be updated" });
            return;
        }

        emitFieldVisitUpdated(tenantId, visit);
        res.json({ success: true, visit });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const cancelFieldVisit = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user);
        const user = req.user!;
        const filter: any = { _id: req.params.id, tenantId };

        if (user.role === 'member') filter.employeeId = user._id;

        const visit = await FieldVisit.findOne(filter);
        if (!visit) {
            res.status(404).json({ message: "Visit not found" });
            return;
        }
        if (visit.status !== 'scheduled') {
            res.status(400).json({ message: `Cannot cancel a visit with status "${visit.status}"` });
            return;
        }

        visit.status = 'cancelled';
        await visit.save();

        emitFieldVisitCancelled(tenantId, visit._id.toString());
        res.json({ success: true, visit });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const checkIn = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user);
        const userId = req.user!._id;
        const visitId = req.params.id;

        const visit = await FieldVisit.findOne({ _id: visitId, tenantId, employeeId: userId });
        if (!visit) {
            res.status(404).json({ message: "Visit not found" });
            return;
        }
        if (visit.status !== 'scheduled') {
            res.status(400).json({ message: `Visit is already ${visit.status}` });
            return;
        }

        const { lat, lng, accuracy, address } = req.body;

        let selfieFilename = '';
        if (req.file) {
            const result = await uploadToGridFS(req.file.buffer, req.file.originalname, req.file.mimetype);
            selfieFilename = result.filename;
        }

        if (!selfieFilename) {
            res.status(400).json({ message: "Selfie is mandatory for check-in" });
            return;
        }

        if (!lat || !lng) {
            res.status(400).json({ message: "Location (lat/lng) is required for check-in" });
            return;
        }

        const latNum = parseFloat(lat);
        const lngNum = parseFloat(lng);
        const accNum = parseFloat(accuracy || '0');

        if (latNum === 0 && lngNum === 0) {
            res.status(400).json({ message: "Invalid location (0,0) — enable GPS" });
            return;
        }
        if (latNum < 6 || latNum > 37 || lngNum < 68 || lngNum > 98) {
            res.status(400).json({ message: "Location outside service area — please enable GPS for accurate location" });
            return;
        }
        if (accNum > 1000) {
            res.status(400).json({ message: "Location accuracy too low — move to an open area and enable GPS" });
            return;
        }

        const tenant = await Tenant.findById(tenantId).select('settings');
        if (tenant?.settings?.geoFenceRadius) {
            visit.geoFenceRadius = tenant.settings.geoFenceRadius;
        }

        const now = new Date();

        visit.checkInTime = now;
        visit.checkInSelfie = selfieFilename;
        visit.checkInLocation = {
            type: 'Point',
            coordinates: [lngNum, latNum],
            address: address || '',
        };
        visit.status = 'checked_in';
        visit.trackingStartedAt = now;
        visit.lastLocationUpdateAt = now;

        await visit.save();

        await LocationTrack.create({
            tenantId,
            visitId: visit._id,
            employeeId: userId,
            points: [{ lat: latNum, lng: lngNum, accuracy: accNum, timestamp: now }],
            startedAt: now,
        });

        emitFieldVisitCheckedIn(tenantId, visit.toObject());
        res.json({ success: true, visit });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const checkOut = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user);
        const userId = req.user!._id;
        const visitId = req.params.id;

        const visit = await FieldVisit.findOne({ _id: visitId, tenantId, employeeId: userId });
        if (!visit) {
            res.status(404).json({ message: "Visit not found" });
            return;
        }
        if (visit.status !== 'checked_in') {
            res.status(400).json({ message: "Visit must be checked in to check out" });
            return;
        }

        const { lat, lng, accuracy, address, outcome, meetingNotes, followUpDate, digitalSignature, checkOutTime } = req.body;

        let selfieFilename = visit.checkOutSelfie || '';
        if (req.file) {
            const result = await uploadToGridFS(req.file.buffer, req.file.originalname, req.file.mimetype);
            selfieFilename = result.filename;
        }

        const now = checkOutTime ? new Date(checkOutTime) : new Date();

        visit.checkOutTime = now;
        if (selfieFilename) visit.checkOutSelfie = selfieFilename;
        if (lat && lng) {
            visit.checkOutLocation = {
                type: 'Point',
                coordinates: [parseFloat(lng), parseFloat(lat)],
                address: address || '',
            };
        }
        visit.status = 'checked_out';
        if (outcome) visit.outcome = outcome;
        if (meetingNotes !== undefined) visit.meetingNotes = meetingNotes;
        if (followUpDate) visit.followUpDate = new Date(followUpDate);
        if (digitalSignature !== undefined) visit.digitalSignature = digitalSignature;
        visit.trackingEndedAt = now;

        await visit.save();

        if (outcome === 'completed') {
            emitFieldVisitCompleted(tenantId, {
                visitId: visit._id.toString(),
                clientName: visit.clientName || '',
                employeeName: req.user!.name,
            });
        }

        const track = await LocationTrack.findOne({ visitId: visit._id }).sort({ startedAt: -1 });
        if (track) {
            track.endedAt = now;
            await track.save();
        }

        emitFieldVisitCheckedOut(tenantId, visit.toObject());
        res.json({ success: true, visit });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const addRemarks = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user);
        const userId = req.user!._id;
        const visitId = req.params.id;
        const { remarks, outcome, meetingNotes, rescheduledDate, rescheduledTime, otherPersonName, otherPersonContact, otherPersonNotes, otherPersonOutcome } = req.body;

        if (!remarks || !remarks.trim()) {
            res.status(400).json({ message: "Remarks text is required" });
            return;
        }

        if (outcome && !['completed', 'rescheduled', 'no_contact', 'met_other'].includes(outcome)) {
            res.status(400).json({ message: "Invalid outcome value" });
            return;
        }

        const filter: any = { _id: visitId, tenantId };
        if (req.user!.role === 'member') filter.employeeId = userId;

        const updateData: any = { remarks: remarks.trim(), remarksAddedAt: new Date() };
        if (outcome) updateData.outcome = outcome;
        if (meetingNotes !== undefined) updateData.meetingNotes = meetingNotes;
        if (rescheduledDate) updateData.rescheduledDate = new Date(rescheduledDate);
        if (rescheduledTime !== undefined) updateData.rescheduledTime = rescheduledTime;
        if (otherPersonName !== undefined) updateData.otherPersonName = otherPersonName;
        if (otherPersonContact !== undefined) updateData.otherPersonContact = otherPersonContact;
        if (otherPersonNotes !== undefined) updateData.otherPersonNotes = otherPersonNotes;
        if (otherPersonOutcome !== undefined) updateData.otherPersonOutcome = otherPersonOutcome;

        const visit = await FieldVisit.findOneAndUpdate(
            filter,
            { $set: updateData },
            { new: true }
        );

        if (!visit) {
            res.status(404).json({ message: "Visit not found or not authorized" });
            return;
        }

        if (outcome === 'completed') {
            const populated = await FieldVisit.findById(visit._id).populate('employeeId', 'name').lean();
            emitFieldVisitCompleted(tenantId, {
                visitId: visit._id.toString(),
                clientName: visit.clientName || '',
                employeeName: (populated?.employeeId as any)?.name || 'Unknown',
            });
        }

        emitFieldVisitUpdated(tenantId, visit);
        res.json({ success: true, visit });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const recordLocation = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user);
        const userId = req.user!._id;
        const visitId = req.params.id;
        const { lat, lng, accuracy } = req.body;

        if (!lat || !lng) {
            res.status(400).json({ message: "lat and lng are required" });
            return;
        }

        const visit = await FieldVisit.findOne({ _id: visitId, tenantId, employeeId: userId, status: 'checked_in' });
        if (!visit) {
            res.status(404).json({ message: "Active visit not found" });
            return;
        }

        const now = new Date();
        const latNum = parseFloat(lat);
        const lngNum = parseFloat(lng);
        const accNum = parseFloat(accuracy || '0');

        const isValidLat = latNum >= -90 && latNum <= 90;
        const isValidLng = lngNum >= -180 && lngNum <= 180;
        if (!isValidLat || !isValidLng) {
            res.status(400).json({ message: "Invalid coordinates" });
            return;
        }

        if (accNum > 5000) {
            res.status(400).json({ message: "Location accuracy too low — enable GPS" });
            return;
        }

        const track = await LocationTrack.findOne({ visitId, endedAt: { $exists: false } });
        if (track) {
            const lastPoint = track.points[track.points.length - 1];
            if (lastPoint) {
                const timeDiff = (now.getTime() - new Date(lastPoint.timestamp).getTime()) / 1000;
                const distDiff = calculateDistance(
                    lastPoint.lat, lastPoint.lng,
                    latNum, lngNum
                );
                const speedMs = timeDiff > 0 ? distDiff / timeDiff : 0;
                const speedKmh = speedMs * 3.6;

                if (speedKmh > 200) {
                    res.status(400).json({ message: `Location spoofing detected — speed ${speedKmh.toFixed(0)} km/h is impossible` });
                    return;
                }
            }
            track.points.push({ lat: latNum, lng: lngNum, accuracy: accNum, timestamp: now });
            await track.save();
        }

        const distance = calculateDistance(
            visit.checkInLocation!.coordinates[1],
            visit.checkInLocation!.coordinates[0],
            latNum,
            lngNum
        );

        const wasBreached = visit.geoFenceBreached;
        if (distance > visit.geoFenceRadius && !visit.geoFenceBreached) {
            visit.geoFenceBreached = true;
        }

        if (visit.trackingLost) {
            visit.trackingLost = false;
            emitFieldVisitTrackingRestored(tenantId, {
                visitId: visit._id.toString(),
                employeeId: userId.toString(),
                employeeName: req.user!.name,
            });
        }

        visit.lastLocationUpdateAt = now;
        await visit.save();

        if (!wasBreached && visit.geoFenceBreached) {
            emitFieldVisitBreached(tenantId, {
                visitId: visit._id.toString(),
                employeeId: userId.toString(),
                employeeName: req.user!.name,
            });
        }


        emitFieldVisitLocation(tenantId, {
            visitId: visit._id.toString(),
            employeeId: userId.toString(),
            lat: latNum,
            lng: lngNum,
            timestamp: now.toISOString(),
        });

        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getLocationTrack = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user);
        const visitId = req.params.id;

        const track = await LocationTrack.findOne({ visitId, tenantId }).sort({ startedAt: -1 }).lean();

        res.json({ success: true, track });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getActiveVisits = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user);
        const visits = await FieldVisit.find({ tenantId, status: 'checked_in' })
            .populate('employeeId', 'name email avatar employeeId')
            .populate('clientId', 'name phone companyName city state')
            .sort({ checkInTime: -1 })
            .lean();

        res.json({ success: true, visits });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const addExpense = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user);
        const visitId = req.params.id;
        const { type, amount, description } = req.body;

        const visit = await FieldVisit.findOne({ _id: visitId, tenantId, employeeId: req.user!._id });
        if (!visit) {
            res.status(404).json({ message: "Visit not found" });
            return;
        }

        let receiptImage = '';
        if (req.file) {
            const result = await uploadToGridFS(req.file.buffer, req.file.originalname, req.file.mimetype);
            receiptImage = result.filename;
        }

        visit.expenses.push({ type, amount: parseFloat(amount), description: description || '', receiptImage });
        await visit.save();

        res.json({ success: true, visit });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const removeExpense = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user);
        const { id, expenseId } = req.params;

        const visit = await FieldVisit.findOneAndUpdate(
            { _id: id, tenantId, employeeId: req.user!._id },
            { $pull: { expenses: { _id: expenseId } } },
            { new: true }
        );

        if (!visit) {
            res.status(404).json({ message: "Visit or expense not found" });
            return;
        }

        res.json({ success: true, visit });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getVisitReports = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user);
        const user = req.user!;
        const { period, employeeId, startDate, endDate } = req.query;

        const match: any = { tenantId };

        if (user.role === 'member') {
            match.employeeId = user._id;
        } else if (employeeId) {
            match.employeeId = new mongoose.Types.ObjectId(employeeId as string);
        }

        if (startDate || endDate) {
            match.createdAt = {};
            if (startDate) match.createdAt.$gte = new Date(startDate as string);
            if (endDate) match.createdAt.$lte = new Date(endDate as string);
        }

        const [totalVisits, statusCounts, outcomeCounts, employeeStats] = await Promise.all([
            FieldVisit.countDocuments(match),
            FieldVisit.aggregate([
                { $match: match },
                { $group: { _id: '$status', count: { $sum: 1 } } },
            ]),
            FieldVisit.aggregate([
                { $match: { ...match, status: 'checked_out' } },
                { $group: { _id: '$outcome', count: { $sum: 1 } } },
            ]),
            FieldVisit.aggregate([
                { $match: match },
                {
                    $group: {
                        _id: '$employeeId',
                        total: { $sum: 1 },
                        completed: { $sum: { $cond: [{ $eq: ['$outcome', 'completed'] }, 1, 0] } },
                        checkedIn: { $sum: { $cond: [{ $eq: ['$status', 'checked_in'] }, 1, 0] } },
                    },
                },
                {
                    $lookup: {
                        from: 'users',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'employee',
                    },
                },
                { $unwind: { path: '$employee', preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 1,
                        total: 1,
                        completed: 1,
                        checkedIn: 1,
                        employeeName: '$employee.name',
                    },
                },
            ]),
        ]);

        res.json({
            success: true,
            reports: {
                totalVisits,
                byStatus: statusCounts,
                byOutcome: outcomeCounts,
                byEmployee: employeeStats,
            },
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const optimizeRoute = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user);
        const { visitIds } = req.body;

        if (!visitIds || !Array.isArray(visitIds) || visitIds.length < 2) {
            res.status(400).json({ message: "At least 2 visit IDs required" });
            return;
        }

        const visits = await FieldVisit.find({ _id: { $in: visitIds }, tenantId }).sort({ visitOrder: 1 }).lean();

        const sorted = visits.map((v, i) => ({
            ...v,
            visitOrder: i + 1,
        }));

        for (const v of sorted) {
            await FieldVisit.updateOne({ _id: v._id }, { $set: { visitOrder: v.visitOrder, routeOptimized: true } });
        }

        res.json({ success: true, visits: sorted });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const approveVisit = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user);
        const visit = await FieldVisit.findOneAndUpdate(
            { _id: req.params.id, tenantId },
            { $set: { outcome: 'completed' } },
            { new: true }
        );
        if (!visit) {
            res.status(404).json({ message: "Visit not found" });
            return;
        }
        emitFieldVisitUpdated(tenantId, visit);
        res.json({ success: true, visit });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const rejectVisit = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user);
        const visit = await FieldVisit.findOneAndUpdate(
            { _id: req.params.id, tenantId },
            { $set: { outcome: 'no_contact' } },
            { new: true }
        );
        if (!visit) {
            res.status(404).json({ message: "Visit not found" });
            return;
        }
        emitFieldVisitUpdated(tenantId, visit);
        res.json({ success: true, visit });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
