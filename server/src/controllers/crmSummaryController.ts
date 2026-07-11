import { Response } from 'express';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import Lead from '../models/Lead';
import CalendarEvent from '../models/CalendarEvent';
import Campaign from '../models/Campaign';
import ActivityLog, { EntityType } from '../models/ActivityLog';
import User from '../models/User';
import Team from '../models/Team';
import FieldVisit from '../models/FieldVisit';
import { AuthRequest } from '../middlewares/auth';

const getDateRange = (scope: string, date: Date) => {
  const year = date.getFullYear();
  const month = date.getMonth();

  if (scope === 'weekly') {
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const start = new Date(date);
    start.setDate(diff);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (scope === 'monthly') {
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }

  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31, 23, 59, 59, 999);
  return { start, end };
};

const getPrevDateRange = (scope: string, date: Date) => {
  if (scope === 'weekly') {
    const prev = new Date(date);
    prev.setDate(date.getDate() - 7);
    return getDateRange(scope, prev);
  }
  if (scope === 'monthly') {
    const prev = new Date(date.getFullYear(), date.getMonth() - 1, 1);
    return getDateRange(scope, prev);
  }
  const prev = new Date(date.getFullYear() - 1, 0, 1);
  return getDateRange(scope, prev);
};

const calcTrend = (current: number, previous: number): number | null => {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
};

export const getCrmSummary = async (req: AuthRequest, res: Response) => {
  try {
    const { scope = 'weekly', date: dateStr, userId } = req.query;
    const validScope = ['weekly', 'monthly', 'yearly'].includes(scope as string) ? scope as string : 'weekly';
    const refDate = dateStr ? new Date(dateStr as string) : new Date();

    const { start, end } = getDateRange(validScope, refDate);
    const prevRange = getPrevDateRange(validScope, refDate);

    const userRole = req.user!.role;
    const currentUserId = req.user!._id;
    const tenantId = (req.user!.tenantId?._id || req.user!.tenantId).toString();

    let targetUserId: mongoose.Types.ObjectId | undefined;

    if (userRole === 'member') {
      targetUserId = currentUserId;
    } else if (userRole === 'manager') {
      if (userId) {
        const managedTeams = await Team.find({ manager: currentUserId }).distinct('members');
        const managedMemberIds = managedTeams.map((id: mongoose.Types.ObjectId) => id.toString());
        if (userId !== currentUserId.toString() && !managedMemberIds.includes(userId as string)) {
          res.status(403).json({ message: 'Forbidden' });
          return;
        }
        targetUserId = new mongoose.Types.ObjectId(userId as string);
      }
    } else if (userRole === 'admin') {
      if (userId) {
        targetUserId = new mongoose.Types.ObjectId(userId as string);
      }
    }

    // Leads — if targetUserId, scope to campaigns they are associated with
    let leadMatch: any = { tenantId: new mongoose.Types.ObjectId(tenantId) };
    if (targetUserId) {
      const userCampaigns = await Campaign.find({
        $or: [{ createdBy: targetUserId }, { people: targetUserId }],
      }).distinct('_id');
      if (userCampaigns.length > 0) {
        leadMatch.campaignId = { $in: userCampaigns };
      }
    }

    const [currentLeads, prevLeads] = await Promise.all([
      Lead.aggregate([
        { $match: { ...leadMatch, createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            new: { $sum: { $cond: [{ $eq: ['$status', 'new'] }, 1, 0] } },
            attempted: { $sum: { $cond: [{ $eq: ['$status', 'attempted'] }, 1, 0] } },
            connected: { $sum: { $cond: [{ $eq: ['$status', 'connected'] }, 1, 0] } },
            interested: { $sum: { $cond: [{ $eq: ['$status', 'interested'] }, 1, 0] } },
            callbackScheduled: { $sum: { $cond: [{ $eq: ['$status', 'callback_scheduled'] }, 1, 0] } },
            meetingScheduled: { $sum: { $cond: [{ $eq: ['$status', 'meeting_scheduled'] }, 1, 0] } },
            notInterested: { $sum: { $cond: [{ $eq: ['$status', 'not_interested'] }, 1, 0] } },
            notReachable: { $sum: { $cond: [{ $eq: ['$status', 'not_reachable'] }, 1, 0] } },
            doNotCall: { $sum: { $cond: [{ $eq: ['$status', 'do_not_call'] }, 1, 0] } },
            closedWon: { $sum: { $cond: [{ $eq: ['$status', 'closed_won'] }, 1, 0] } },
            closedLost: { $sum: { $cond: [{ $eq: ['$status', 'closed_lost'] }, 1, 0] } },
            callDuration: { $sum: '$callDuration' },
            callCount: { $sum: '$callCount' },
          },
        },
      ]),
      Lead.aggregate([
        { $match: { ...leadMatch, createdAt: { $gte: prevRange.start, $lte: prevRange.end } } },
        {
          $group: {
            _id: null,
            contacted: {
              $sum: {
                $cond: [{ $in: ['$status', ['connected', 'interested', 'callback_scheduled', 'meeting_scheduled']] }, 1, 0],
              },
            },
            won: { $sum: { $cond: [{ $eq: ['$status', 'closed_won'] }, 1, 0] } },
          },
        },
      ]),
    ]);

    const defaultCur = { total: 0, new: 0, attempted: 0, connected: 0, interested: 0, callbackScheduled: 0, meetingScheduled: 0, notInterested: 0, notReachable: 0, doNotCall: 0, closedWon: 0, closedLost: 0, callDuration: 0, callCount: 0 };
    const lCur = currentLeads[0] || { ...defaultCur };
    const lPrev = prevLeads[0] || { contacted: 0, won: 0 };

    // Calendar events
    let eventMatch: any = {
      startDate: { $gte: start, $lte: end },
      eventType: { $in: ['meeting', 'event'] },
    };
    if (targetUserId) {
      eventMatch.$or = [
        { createdBy: targetUserId },
        { 'attendees.user': targetUserId },
      ];
    }

    const prevEventMatch: any = {
      startDate: { $gte: prevRange.start, $lte: prevRange.end },
      eventType: { $in: ['meeting', 'event'] },
    };
    if (targetUserId) {
      prevEventMatch.$or = [
        { createdBy: targetUserId },
        { 'attendees.user': targetUserId },
      ];
    }

    const [currentEvents, prevEvents] = await Promise.all([
      CalendarEvent.countDocuments(eventMatch),
      CalendarEvent.countDocuments(prevEventMatch),
    ]);

    // Chart data — CRM activity bucketed by period
    let chartData: { name: string; contacted: number; won: number }[] = [];

    if (validScope === 'weekly') {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const raw = await Lead.aggregate([
        { $match: { ...leadMatch, createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: { $dayOfWeek: '$createdAt' },
            contacted: { $sum: { $cond: [{ $in: ['$status', ['connected', 'interested', 'callback_scheduled', 'meeting_scheduled']] }, 1, 0] } },
            won: { $sum: { $cond: [{ $eq: ['$status', 'closed_won'] }, 1, 0] } },
          },
        },
      ]);
      const map: Record<number, any> = {};
      raw.forEach((d: any) => { map[d._id] = d; });
      for (let i = 1; i <= 7; i++) {
        chartData.push({ name: days[i - 1], contacted: map[i]?.contacted || 0, won: map[i]?.won || 0 });
      }
    } else if (validScope === 'monthly') {
      const weeks = ['W1', 'W2', 'W3', 'W4', 'W5'];
      const raw = await Lead.aggregate([
        { $match: { ...leadMatch, createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: { $ceil: { $divide: [{ $dayOfMonth: '$createdAt' }, 7] } },
            contacted: { $sum: { $cond: [{ $in: ['$status', ['connected', 'interested', 'callback_scheduled', 'meeting_scheduled']] }, 1, 0] } },
            won: { $sum: { $cond: [{ $eq: ['$status', 'closed_won'] }, 1, 0] } },
          },
        },
      ]);
      const map: Record<number, any> = {};
      raw.forEach((d: any) => { map[d._id] = d; });
      for (let i = 1; i <= 5; i++) {
        chartData.push({ name: weeks[i - 1], contacted: map[i]?.contacted || 0, won: map[i]?.won || 0 });
      }
    } else {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const raw = await Lead.aggregate([
        { $match: { ...leadMatch, createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: { $month: '$createdAt' },
            contacted: { $sum: { $cond: [{ $in: ['$status', ['connected', 'interested', 'callback_scheduled', 'meeting_scheduled']] }, 1, 0] } },
            won: { $sum: { $cond: [{ $eq: ['$status', 'closed_won'] }, 1, 0] } },
          },
        },
      ]);
      const map: Record<number, any> = {};
      raw.forEach((d: any) => { map[d._id] = d; });
      for (let i = 1; i <= 12; i++) {
        chartData.push({ name: months[i - 1], contacted: map[i]?.contacted || 0, won: map[i]?.won || 0 });
      }
    }

    const fmtDuration = (s: number) => {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    const conversionRate = lCur.contacted > 0 ? Math.round((lCur.won / lCur.contacted) * 100) : 0;

    res.json({
      scope: validScope,
      dateRange: { start, end },
      leads: {
        total: lCur.total,
        contacted: lCur.contacted,
        won: lCur.won,
        callDuration: lCur.callDuration,
        callDurationLabel: fmtDuration(lCur.callDuration),
        callCount: lCur.callCount,
        contactedTrend: calcTrend(lCur.contacted, lPrev.contacted),
        wonTrend: calcTrend(lCur.won, lPrev.won),
        statusBreakdown: {
          new: lCur.new,
          attempted: lCur.attempted,
          connected: lCur.connected,
          interested: lCur.interested,
          callbackScheduled: lCur.callbackScheduled,
          meetingScheduled: lCur.meetingScheduled,
          notInterested: lCur.notInterested,
          notReachable: lCur.notReachable,
          doNotCall: lCur.doNotCall,
          closedWon: lCur.closedWon,
          closedLost: lCur.closedLost,
        },
      },
      events: {
        total: currentEvents,
        trend: calcTrend(currentEvents, prevEvents),
      },
      conversionRate,
      chartData,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

const fmtDuration = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export const exportCrmSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { scope = 'weekly', date: dateStr, userId } = req.query;
    const validScope = ['weekly', 'monthly', 'yearly'].includes(scope as string) ? scope as string : 'weekly';
    const refDate = dateStr ? new Date(dateStr as string) : new Date();

    const { start, end } = getDateRange(validScope, refDate);
    const prevRange = getPrevDateRange(validScope, refDate);

    const userRole = req.user!.role;
    const currentUserId = req.user!._id;
    const tenantId = (req.user!.tenantId?._id || req.user!.tenantId).toString();

    let targetUserId: mongoose.Types.ObjectId | undefined;

    if (userRole === 'member') {
      targetUserId = currentUserId;
    } else if (userRole === 'manager') {
      if (userId) {
        const managedTeams = await Team.find({ manager: currentUserId }).distinct('members');
        const managedMemberIds = managedTeams.map((id: mongoose.Types.ObjectId) => id.toString());
        if (userId !== currentUserId.toString() && !managedMemberIds.includes(userId as string)) {
          res.status(403).json({ message: 'Forbidden' });
          return;
        }
        targetUserId = new mongoose.Types.ObjectId(userId as string);
      }
    } else if (userRole === 'admin') {
      if (userId) {
        targetUserId = new mongoose.Types.ObjectId(userId as string);
      }
    }

    let leadMatch: any = { tenantId: new mongoose.Types.ObjectId(tenantId) };
    if (targetUserId) {
      const userCampaigns = await Campaign.find({
        $or: [{ createdBy: targetUserId }, { people: targetUserId }],
      }).distinct('_id');
      if (userCampaigns.length > 0) {
        leadMatch.campaignId = { $in: userCampaigns };
      }
    }

    const dateRangeLabel = `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`;
    const scopeLabel = validScope.charAt(0).toUpperCase() + validScope.slice(1);

    const trendGroupId = validScope === 'weekly'
      ? { $dayOfWeek: '$createdAt' }
      : validScope === 'monthly'
        ? { $ceil: { $divide: [{ $dayOfMonth: '$createdAt' }, 7] } }
        : { $month: '$createdAt' };

    // ── Single $facet aggregation for all lead-level data ──
    const [facetResults] = await Lead.aggregate([
      { $match: { ...leadMatch, createdAt: { $gte: start, $lte: end } } },
      {
        $facet: {
          overview: [{
            $group: {
              _id: null,
              total: { $sum: 1 },
              new: { $sum: { $cond: [{ $eq: ['$status', 'new'] }, 1, 0] } },
              attempted: { $sum: { $cond: [{ $eq: ['$status', 'attempted'] }, 1, 0] } },
              connected: { $sum: { $cond: [{ $eq: ['$status', 'connected'] }, 1, 0] } },
              interested: { $sum: { $cond: [{ $eq: ['$status', 'interested'] }, 1, 0] } },
              callbackScheduled: { $sum: { $cond: [{ $eq: ['$status', 'callback_scheduled'] }, 1, 0] } },
              meetingScheduled: { $sum: { $cond: [{ $eq: ['$status', 'meeting_scheduled'] }, 1, 0] } },
              notInterested: { $sum: { $cond: [{ $eq: ['$status', 'not_interested'] }, 1, 0] } },
              notReachable: { $sum: { $cond: [{ $eq: ['$status', 'not_reachable'] }, 1, 0] } },
              doNotCall: { $sum: { $cond: [{ $eq: ['$status', 'do_not_call'] }, 1, 0] } },
              closedWon: { $sum: { $cond: [{ $eq: ['$status', 'closed_won'] }, 1, 0] } },
              closedLost: { $sum: { $cond: [{ $eq: ['$status', 'closed_lost'] }, 1, 0] } },
              callDuration: { $sum: '$callDuration' },
              callCount: { $sum: '$callCount' },
            },
          }],
          statusBreakdown: [
            { $group: { _id: '$status', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ],
          campaignPerformance: [
            {
              $group: {
                _id: '$campaignId',
                total: { $sum: 1 },
                new: { $sum: { $cond: [{ $eq: ['$status', 'new'] }, 1, 0] } },
                attempted: { $sum: { $cond: [{ $eq: ['$status', 'attempted'] }, 1, 0] } },
                connected: { $sum: { $cond: [{ $eq: ['$status', 'connected'] }, 1, 0] } },
                interested: { $sum: { $cond: [{ $eq: ['$status', 'interested'] }, 1, 0] } },
                callbackScheduled: { $sum: { $cond: [{ $eq: ['$status', 'callback_scheduled'] }, 1, 0] } },
                meetingScheduled: { $sum: { $cond: [{ $eq: ['$status', 'meeting_scheduled'] }, 1, 0] } },
                notInterested: { $sum: { $cond: [{ $eq: ['$status', 'not_interested'] }, 1, 0] } },
                notReachable: { $sum: { $cond: [{ $eq: ['$status', 'not_reachable'] }, 1, 0] } },
                doNotCall: { $sum: { $cond: [{ $eq: ['$status', 'do_not_call'] }, 1, 0] } },
                won: { $sum: { $cond: [{ $eq: ['$status', 'closed_won'] }, 1, 0] } },
                lost: { $sum: { $cond: [{ $eq: ['$status', 'closed_lost'] }, 1, 0] } },
              },
            },
            { $lookup: { from: 'campaigns', localField: '_id', foreignField: '_id', as: 'campaign' } },
            { $unwind: { path: '$campaign', preserveNullAndEmptyArrays: true } },
            { $sort: { total: -1 } },
          ],
          trendData: [
            {
              $group: {
                _id: trendGroupId,
                contacted: { $sum: { $cond: [{ $in: ['$status', ['connected', 'interested', 'callback_scheduled', 'meeting_scheduled']] }, 1, 0] } },
                won: { $sum: { $cond: [{ $eq: ['$status', 'closed_won'] }, 1, 0] } },
              },
            },
          ],
          callActivity: [
            { $match: { callCount: { $gt: 0 } } },
            { $lookup: { from: 'campaigns', localField: 'campaignId', foreignField: '_id', as: 'campaign' } },
            { $unwind: { path: '$campaign', preserveNullAndEmptyArrays: true } },
            { $sort: { lastCallAt: -1 } },
            { $limit: 10000 },
            {
              $project: {
                name: 1, phone: 1, alternatePhone: 1, email: 1,
                companyName: 1, city: 1, state: 1, industry: 1,
                priority: 1, status: 1, callCount: 1, callDuration: 1,
                lastCallAt: 1, campaignName: '$campaign.name',
              },
            },
          ],
        },
      },
    ]);

    // ── Field visit data ──
    const visitMatch: any = { tenantId: new mongoose.Types.ObjectId(tenantId), createdAt: { $gte: start, $lte: end } };
    if (targetUserId) visitMatch.employeeId = targetUserId;

    const [visitStatusCounts, visitOutcomeCounts, visitEmployeeStats] = await Promise.all([
      FieldVisit.aggregate([
        { $match: visitMatch },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      FieldVisit.aggregate([
        { $match: { ...visitMatch, status: 'checked_out' } },
        { $group: { _id: '$outcome', count: { $sum: 1 } } },
      ]),
      FieldVisit.aggregate([
        { $match: visitMatch },
        {
          $group: {
            _id: '$employeeId',
            total: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$outcome', 'completed'] }, 1, 0] } },
            checkedIn: { $sum: { $cond: [{ $eq: ['$status', 'checked_in'] }, 1, 0] } },
          },
        },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'employee' } },
        { $unwind: { path: '$employee', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1, total: 1, completed: 1, checkedIn: 1,
            employeeName: { $ifNull: ['$employee.name', 'Unknown'] },
          },
        },
      ]),
    ]);

    const totalVisits = visitStatusCounts.reduce((sum, s) => sum + s.count, 0);
    const visitStatusMap: Record<string, number> = {};
    visitStatusCounts.forEach((s: any) => { visitStatusMap[s._id] = s.count; });
    const visitOutcomeMap: Record<string, number> = {};
    visitOutcomeCounts.forEach((s: any) => { visitOutcomeMap[s._id] = s.count; });

    // ── Previous period + telecaller + activity + events in parallel ──
    const [prevAgg, telecallerData, activityData, currentEvents] = await Promise.all([
      Lead.aggregate([
        { $match: { ...leadMatch, createdAt: { $gte: prevRange.start, $lte: prevRange.end } } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            contacted: { $sum: { $cond: [{ $in: ['$status', ['connected', 'interested', 'callback_scheduled', 'meeting_scheduled']] }, 1, 0] } },
            won: { $sum: { $cond: [{ $eq: ['$status', 'closed_won'] }, 1, 0] } },
          },
        },
      ]),
      Lead.aggregate([
        { $match: { ...leadMatch, createdAt: { $gte: start, $lte: end } } },
        { $lookup: { from: 'campaigns', localField: 'campaignId', foreignField: '_id', as: 'campaign' } },
        { $unwind: { path: '$campaign', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: '$campaign.createdBy',
            total: { $sum: 1 },
            contacted: { $sum: { $cond: [{ $in: ['$status', ['connected', 'interested', 'callback_scheduled', 'meeting_scheduled']] }, 1, 0] } },
            connected: { $sum: { $cond: [{ $eq: ['$status', 'connected'] }, 1, 0] } },
            interested: { $sum: { $cond: [{ $eq: ['$status', 'interested'] }, 1, 0] } },
            won: { $sum: { $cond: [{ $eq: ['$status', 'closed_won'] }, 1, 0] } },
            lost: { $sum: { $cond: [{ $eq: ['$status', 'closed_lost'] }, 1, 0] } },
            callCount: { $sum: '$callCount' },
            callDuration: { $sum: '$callDuration' },
          },
        },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        { $sort: { contacted: -1 } },
      ]),
      (async () => {
        const activityMatch: any = {
          createdAt: { $gte: start, $lte: end },
          entityType: { $in: [EntityType.CAMPAIGN, EntityType.LEAD] },
        };
        if (targetUserId) activityMatch.user = targetUserId;
        return ActivityLog.find(activityMatch)
          .populate('user', 'name')
          .sort({ createdAt: -1 })
          .limit(2000)
          .lean();
      })(),
      (async () => {
        const eventMatch: any = { startDate: { $gte: start, $lte: end }, eventType: { $in: ['meeting', 'event'] } };
        if (targetUserId) eventMatch.$or = [{ createdBy: targetUserId }, { 'attendees.user': targetUserId }];
        return CalendarEvent.countDocuments(eventMatch);
      })(),
    ]);

    // ── Extract facet results ──
    const cur = facetResults.overview?.[0] || { total: 0, new: 0, attempted: 0, connected: 0, interested: 0, callbackScheduled: 0, meetingScheduled: 0, notInterested: 0, notReachable: 0, doNotCall: 0, closedWon: 0, closedLost: 0, callDuration: 0, callCount: 0 };
    const prev = prevAgg[0] || { total: 0, contacted: 0, won: 0 };
    const statusData = facetResults.statusBreakdown || [];
    const campaignData = facetResults.campaignPerformance || [];
    const callActivity = facetResults.callActivity || [];
    const chartRaw = facetResults.trendData || [];

    const totalLeads = cur.total;
    const contacted = cur.connected + cur.interested + cur.callbackScheduled + cur.meetingScheduled;
    const won = cur.closedWon;
    const conversionRate = contacted > 0 ? Math.round((won / contacted) * 100) : 0;
    const contactRate = totalLeads > 0 ? Math.round((contacted / totalLeads) * 100) : 0;

    const statusLabels: Record<string, string> = {
      new: 'New', attempted: 'Attempted', connected: 'Connected',
      interested: 'Interested', callback_scheduled: 'Callback Scheduled',
      meeting_scheduled: 'Meeting Scheduled', not_interested: 'Not Interested',
      not_reachable: 'Not Reachable', do_not_call: 'Do Not Call',
      closed_won: 'Closed Won', closed_lost: 'Closed Lost',
    };

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CRM System';
    workbook.created = new Date();

    const borderStyle: Partial<ExcelJS.Borders> = {
      bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
    };
    const headerFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF2C3E50' } };
    const headerFont = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    const titleFont = { bold: true, size: 16, color: { argb: 'FF2C3E50' } };
    const subtitleFont = { bold: false, size: 10, color: { argb: 'FF888888' } };
    const kpiLabelFont = { bold: false, size: 10, color: { argb: 'FF888888' } };
    const kpiValueFont = { bold: true, size: 14, color: { argb: 'FF2C3E50' } };

    const addTableHeaders = (sheet: ExcelJS.Worksheet, headers: { header: string; width: number }[], rowNum: number = 1) => {
      const row = sheet.getRow(rowNum);
      headers.forEach((h, i) => {
        const col = i + 1;
        sheet.getColumn(col).width = h.width;
        const cell = row.getCell(col);
        cell.value = h.header;
        cell.font = headerFont;
        cell.fill = headerFill;
        cell.border = borderStyle;
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });
      return rowNum + 1;
    };

    const addDataRow = (sheet: ExcelJS.Worksheet, data: any[], rowNum: number) => {
      const row = sheet.getRow(rowNum);
      data.forEach((val, i) => {
        const cell = row.getCell(i + 1);
        cell.value = val;
        cell.border = borderStyle;
        cell.alignment = { vertical: 'middle', horizontal: typeof val === 'number' ? 'right' : 'left' };
      });
      return rowNum + 1;
    };

    const addTitle = (sheet: ExcelJS.Worksheet, text: string, rowNum: number, mergeToCol: number = 6) => {
      const row = sheet.getRow(rowNum);
      sheet.mergeCells(rowNum, 1, rowNum, mergeToCol);
      const cell = row.getCell(1);
      cell.value = text;
      cell.font = titleFont;
      row.height = 30;
      return rowNum + 1;
    };

    const addSubtitle = (sheet: ExcelJS.Worksheet, text: string, rowNum: number, mergeToCol: number = 6) => {
      const row = sheet.getRow(rowNum);
      sheet.mergeCells(rowNum, 1, rowNum, mergeToCol);
      const cell = row.getCell(1);
      cell.value = text;
      cell.font = subtitleFont;
      row.height = 18;
      return rowNum + 1;
    };

    const buildTrend = (cur: number, prev: number): string => {
      if (prev === 0) return cur > 0 ? '+100%' : '—';
      const pct = Math.round(((cur - prev) / prev) * 100);
      return pct >= 0 ? `+${pct}%` : `${pct}%`;
    };

    // ── Helper: write all sheets ──
    const writeSheets = () => {
      // ── Sheet 1: Executive Summary ──
      const execSheet = workbook.addWorksheet('Executive Summary');
      let r = 1;
      r = addTitle(execSheet, 'CRM Executive Summary', r, 4);
      r = addSubtitle(execSheet, `Report Period: ${dateRangeLabel} (${scopeLabel})`, r, 4);
      r = addSubtitle(execSheet, `Generated: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, r, 4);
      r += 1;

      execSheet.getColumn(1).width = 22;
      execSheet.getColumn(2).width = 14;
      execSheet.getColumn(3).width = 14;
      execSheet.getColumn(4).width = 22;
      execSheet.getColumn(5).width = 14;
      execSheet.getColumn(6).width = 14;

      const kpiRows: { label: string; value: string | number; trend: string }[][] = [
        [
          { label: 'Total Leads', value: totalLeads, trend: buildTrend(totalLeads, prev.total) },
          { label: 'Leads Contacted', value: contacted, trend: buildTrend(contacted, prev.contacted) },
          { label: 'Leads Won', value: won, trend: buildTrend(won, prev.won) },
          { label: 'Conversion Rate', value: `${conversionRate}%`, trend: `Target: >25%` },
        ],
        [
          { label: 'New Leads', value: cur.new, trend: '' },
          { label: 'Call Count', value: cur.callCount, trend: '' },
          { label: 'Call Duration', value: fmtDuration(cur.callDuration), trend: '' },
          { label: 'Meetings', value: currentEvents, trend: '' },
        ],
      ];
      kpiRows.forEach((kpis) => {
        kpis.forEach((kpi, i) => {
          const col = i * 2 + 1;
          execSheet.mergeCells(r, col, r + 1, col + 1);
          const lCell = execSheet.getCell(r, col);
          lCell.value = kpi.label;
          lCell.font = kpiLabelFont;
          lCell.alignment = { vertical: 'bottom', horizontal: 'left' };
          const vCell = execSheet.getCell(r + 1, col);
          vCell.value = kpi.value;
          vCell.font = kpiValueFont;
          vCell.alignment = { vertical: 'top', horizontal: 'left' };
          if (kpi.trend && kpi.trend !== 'Target: >25%') {
            const trendCell = execSheet.getCell(r + 1, col + 1);
            trendCell.value = kpi.trend;
            trendCell.font = { bold: true, size: 11, color: { argb: kpi.trend.startsWith('+') ? 'FF22C55E' : kpi.trend === '—' ? 'FF888888' : 'FFDC2626' } };
            trendCell.alignment = { vertical: 'top', horizontal: 'left' };
          }
        });
        r += 3;
      });

      r = addSubtitle(execSheet, `Contact Rate: ${contactRate}%  |  ${cur.attempted} Attempted  |  ${cur.connected} Connected  |  ${cur.interested} Interested  |  ${cur.notInterested} Not Interested  |  ${cur.notReachable} Not Reachable  |  ${cur.doNotCall} Do Not Call  |  ${cur.closedLost} Closed Lost`, r, 6);
      r += 1;

      r = addTableHeaders(execSheet, [
        { header: 'Status', width: 22 }, { header: 'Count', width: 12 },
        { header: 'Percentage', width: 14 }, { header: 'Prev Period', width: 14 }, { header: 'Change', width: 12 },
      ], r);
      const statusMap: Record<string, number> = {};
      statusData.forEach((d: any) => { statusMap[d._id] = d.count; });
      const statusOrder = ['new', 'attempted', 'connected', 'interested', 'callback_scheduled', 'meeting_scheduled', 'not_interested', 'not_reachable', 'do_not_call', 'closed_won', 'closed_lost'];
      statusOrder.forEach((st) => {
        const count = statusMap[st] || 0;
        const pct = totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0;
        const row = execSheet.addRow([statusLabels[st] || st, count, `${pct}%`, '', '']);
        row.eachCell((cell) => { cell.border = borderStyle; });
      });

      // ── Sheet 2: Telecaller Performance ──
      const telecallerSheet = workbook.addWorksheet('Telecaller Performance');
      let tcr = 1;
      tcr = addTitle(telecallerSheet, 'Telecaller Performance Report', tcr, 12);
      tcr = addSubtitle(telecallerSheet, dateRangeLabel, tcr, 12);
      tcr += 1;
      tcr = addTableHeaders(telecallerSheet, [
        { header: '#', width: 4 }, { header: 'Telecaller', width: 22 },
        { header: 'Total Leads', width: 14 }, { header: 'Contacted', width: 14 },
        { header: 'Connected', width: 14 }, { header: 'Interested', width: 14 },
        { header: 'Won', width: 12 }, { header: 'Lost', width: 12 },
        { header: 'Call Count', width: 12 }, { header: 'Call Duration', width: 16 },
        { header: 'Contact Rate', width: 14 }, { header: 'Conversion Rate', width: 16 },
      ], tcr);
      telecallerData.forEach((d: any, i: number) => {
        const ct = d.contacted || 0;
        const wn = d.won || 0;
        addDataRow(telecallerSheet, [
          i + 1, d.user?.name || 'Unknown', d.total || 0, ct, d.connected || 0, d.interested || 0,
          wn, d.lost || 0, d.callCount || 0, fmtDuration(d.callDuration || 0),
          d.total > 0 ? `${Math.round((ct / d.total) * 100)}%` : '—',
          ct > 0 ? `${Math.round((wn / ct) * 100)}%` : '—',
        ], tcr);
        tcr++;
      });

      // ── Sheet 3: Campaign Performance ──
      const campaignSheet = workbook.addWorksheet('Campaign Performance');
      let cpr = 1;
      cpr = addTitle(campaignSheet, 'Campaign Performance Report', cpr, 12);
      cpr = addSubtitle(campaignSheet, dateRangeLabel, cpr, 12);
      cpr += 1;
      cpr = addTableHeaders(campaignSheet, [
        { header: 'Campaign', width: 24 }, { header: 'Total', width: 10 },
        { header: 'New', width: 10 }, { header: 'Attempted', width: 12 },
        { header: 'Connected', width: 12 }, { header: 'Interested', width: 12 },
        { header: 'Callback', width: 12 }, { header: 'Meeting', width: 12 },
        { header: 'Won', width: 10 }, { header: 'Lost', width: 10 },
        { header: 'Contact Rate', width: 14 }, { header: 'Conversion Rate', width: 16 },
      ], cpr);
      campaignData.forEach((d: any) => {
        const ct = (d.connected || 0) + (d.interested || 0) + (d.callbackScheduled || 0) + (d.meetingScheduled || 0);
        const wn = d.won || 0;
        addDataRow(campaignSheet, [
          d.campaign?.name || 'Unknown', d.total, d.new || 0, d.attempted || 0,
          d.connected || 0, d.interested || 0, d.callbackScheduled || 0, d.meetingScheduled || 0,
          wn, d.lost || 0,
          d.total > 0 ? `${Math.round((ct / d.total) * 100)}%` : '—',
          ct > 0 ? `${Math.round((wn / ct) * 100)}%` : '—',
        ], cpr);
        cpr++;
      });

      // ── Sheet 4: Lead Status Breakdown ──
      const statusSheet = workbook.addWorksheet('Lead Status Breakdown');
      let sr = 1;
      sr = addTitle(statusSheet, 'Lead Status Breakdown', sr, 6);
      sr = addSubtitle(statusSheet, dateRangeLabel, sr, 6);
      sr += 1;
      sr = addTableHeaders(statusSheet, [
        { header: 'Status', width: 22 }, { header: 'Count', width: 12 },
        { header: 'Percentage', width: 14 },
      ], sr);
      statusOrder.forEach((st) => {
        const count = statusMap[st] || 0;
        if (count === 0) return;
        const pct = totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0;
        addDataRow(statusSheet, [statusLabels[st] || st, count, `${pct}%`], sr);
        sr++;
      });

      // ── Sheet 5: Call Activity Log ──
      const callSheet = workbook.addWorksheet('Call Activity Log');
      let calr = 1;
      calr = addTitle(callSheet, 'Call Activity Log', calr, 12);
      calr = addSubtitle(callSheet, dateRangeLabel, calr, 12);
      calr += 1;
      calr = addTableHeaders(callSheet, [
        { header: 'Lead Name', width: 20 }, { header: 'Phone', width: 16 },
        { header: 'Alternate Phone', width: 16 }, { header: 'Email', width: 24 },
        { header: 'Company', width: 20 }, { header: 'City', width: 14 },
        { header: 'State', width: 14 }, { header: 'Industry', width: 16 },
        { header: 'Priority', width: 12 }, { header: 'Campaign', width: 20 },
        { header: 'Call Count', width: 12 }, { header: 'Call Duration', width: 14 },
        { header: 'Last Call', width: 18 }, { header: 'Status', width: 16 },
      ], calr);
      callActivity.forEach((d: any) => {
        addDataRow(callSheet, [
          d.name, d.phone || '—', d.alternatePhone || '—', d.email || '—',
          d.companyName || '—', d.city || '—', d.state || '—', d.industry || '—',
          d.priority || '—', d.campaignName || '—',
          d.callCount, fmtDuration(d.callDuration || 0),
          d.lastCallAt ? new Date(d.lastCallAt).toISOString().slice(0, 16).replace('T', ' ') : '—',
          statusLabels[d.status] || d.status,
        ], calr);
        calr++;
      });

      // ── Sheet 6: Daily Activity Log ──
      const activitySheet = workbook.addWorksheet('Daily Activity Log');
      let ar = 1;
      ar = addTitle(activitySheet, 'Daily Activity Log', ar, 6);
      ar = addSubtitle(activitySheet, dateRangeLabel, ar, 6);
      ar += 1;
      ar = addTableHeaders(activitySheet, [
        { header: 'Date', width: 18 }, { header: 'User', width: 20 },
        { header: 'Action', width: 24 }, { header: 'Entity Type', width: 16 },
        { header: 'Entity ID', width: 28 }, { header: 'Details', width: 40 },
      ], ar);
      (activityData as any[]).forEach((d: any) => {
        addDataRow(activitySheet, [
          new Date(d.createdAt).toISOString().slice(0, 16).replace('T', ' '),
          d.user?.name || 'Unknown', d.action, d.entityType,
          d.entityId?.toString() || '—',
          d.metadata ? JSON.stringify(d.metadata).slice(0, 120) : '—',
        ], ar);
        ar++;
      });

      // ── Sheet 7: Conversion Funnel ──
      const funnelSheet = workbook.addWorksheet('Conversion Funnel');
      let fr = 1;
      fr = addTitle(funnelSheet, 'Conversion Funnel Analysis', fr, 6);
      fr = addSubtitle(funnelSheet, dateRangeLabel, fr, 6);
      fr += 1;
      fr = addTableHeaders(funnelSheet, [
        { header: 'Stage', width: 24 }, { header: 'Count', width: 12 },
        { header: '% of Total', width: 12 }, { header: 'Stage Drop-off', width: 16 },
        { header: 'Stage Conversion', width: 18 }, { header: 'Overall Conversion', width: 20 },
      ], fr);
      const funnelStages = ['new', 'attempted', 'connected', 'interested', 'callback_scheduled', 'meeting_scheduled', 'closed_won', 'closed_lost'];
      const firstStageCount = statusMap[funnelStages[0]] || 1;
      funnelStages.forEach((stage, i) => {
        const count = statusMap[stage] || 0;
        const prevCount = statusMap[funnelStages[i - 1]] || 0;
        const pctTotal = totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0;
        const dropOff = i === 0 ? '—' : prevCount > 0 ? `${Math.round(((prevCount - count) / prevCount) * 100)}%` : '—';
        const stageConv = i === 0 ? '—' : prevCount > 0 ? `${Math.round((count / prevCount) * 100)}%` : '—';
        const overallConv = `${Math.round((count / firstStageCount) * 100)}%`;
        addDataRow(funnelSheet, [statusLabels[stage] || stage, count, `${pctTotal}%`, dropOff, stageConv, i === 0 ? '100%' : overallConv], fr);
        fr++;
      });

      // ── Sheet 8: Trend Data ──
      const trendSheet = workbook.addWorksheet('Trend Data');
      let trr = 1;
      trr = addTitle(trendSheet, 'Period Trend Data', trr, 4);
      trr = addSubtitle(trendSheet, dateRangeLabel, trr, 4);
      trr += 1;
      trr = addTableHeaders(trendSheet, [
        { header: validScope === 'weekly' ? 'Day' : validScope === 'monthly' ? 'Week' : 'Month', width: 16 },
        { header: 'Contacted', width: 14 }, { header: 'Won', width: 12 }, { header: 'Conversion Rate', width: 18 },
      ], trr);

      const periodLabels = validScope === 'weekly'
        ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        : validScope === 'monthly'
          ? ['W1', 'W2', 'W3', 'W4', 'W5']
          : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      const chartMap: Record<number, any> = {};
      chartRaw.forEach((d: any) => { chartMap[d._id] = d; });
      const maxIdx = validScope === 'weekly' ? 7 : validScope === 'monthly' ? 5 : 12;
      for (let i = 1; i <= maxIdx; i++) {
        const d = chartMap[i];
        const ct = d?.contacted || 0;
        const wn = d?.won || 0;
        addDataRow(trendSheet, [periodLabels[i - 1], ct, wn, ct > 0 ? `${Math.round((wn / ct) * 100)}%` : '—'], trr);
        trr++;
      }

      // ── Sheet 9: Field Visit Reports ──
      const visitSheet = workbook.addWorksheet('Field Visit Reports');
      let vr = 1;
      vr = addTitle(visitSheet, 'Field Visit Reports', vr, 8);
      vr = addSubtitle(visitSheet, dateRangeLabel, vr, 8);
      vr += 1;

      vr = addTableHeaders(visitSheet, [
        { header: 'Metric', width: 20 }, { header: 'Value', width: 12 },
      ], vr);
      addDataRow(visitSheet, ['Total Visits', totalVisits], vr); vr++;
      addDataRow(visitSheet, ['Scheduled', visitStatusMap['scheduled'] || 0], vr); vr++;
      addDataRow(visitSheet, ['Checked In', visitStatusMap['checked_in'] || 0], vr); vr++;
      addDataRow(visitSheet, ['Checked Out', visitStatusMap['checked_out'] || 0], vr); vr++;
      addDataRow(visitSheet, ['Cancelled', visitStatusMap['cancelled'] || 0], vr); vr++;
      vr += 1;

      const outcomeLabels: Record<string, string> = {
        completed: 'Completed', rescheduled: 'Rescheduled',
        no_contact: 'No Contact', met_other: 'Met Other',
      };
      vr = addTableHeaders(visitSheet, [
        { header: 'Outcome', width: 20 }, { header: 'Count', width: 12 },
      ], vr);
      Object.entries(outcomeLabels).forEach(([key, label]) => {
        addDataRow(visitSheet, [label, visitOutcomeMap[key] || 0], vr);
        vr++;
      });
      vr += 1;

      if (visitEmployeeStats.length > 0) {
        vr = addTableHeaders(visitSheet, [
          { header: 'Employee', width: 24 }, { header: 'Total Visits', width: 14 },
          { header: 'Checked In', width: 14 }, { header: 'Completed', width: 14 },
        ], vr);
        visitEmployeeStats.forEach((emp: any) => {
          addDataRow(visitSheet, [emp.employeeName, emp.total, emp.checkedIn, emp.completed], vr);
          vr++;
        });
      }
    };

    writeSheets();

    const filename = `crm_report_${validScope}_${Date.now()}`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
