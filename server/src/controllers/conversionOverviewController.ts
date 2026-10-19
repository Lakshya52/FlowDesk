import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middlewares/auth';
import ActivityLog, { EntityType } from '../models/ActivityLog';
import CaseFile from '../models/CaseFile';
import Lead from '../models/Lead';
import User from '../models/User';
import { getTenantId } from '../utils/tenant';

const normalizeUser = (user: any) => {
    if (!user) return null;
    return {
        _id: String(user._id || user),
        name: user.name || 'Unknown',
        email: user.email,
        avatar: user.avatar,
        role: user.role,
    };
};

type MetricKey =
    | 'calls'
    | 'followUps'
    | 'meetings'
    | 'notes'
    | 'leadsCreated'
    | 'filesCreated'
    | 'sanctioned'
    | 'lost'
    | 'statusChanges';

const emptyMetrics = (): Record<MetricKey, number> => ({
    calls: 0,
    followUps: 0,
    meetings: 0,
    notes: 0,
    leadsCreated: 0,
    filesCreated: 0,
    sanctioned: 0,
    lost: 0,
    statusChanges: 0,
});

// The activity feed narrows to one kind of action — applied before the
// limit so "Load more" and the totals stay accurate.
const matchesHistoryFilter = (log: any, filter: string): boolean => {
    const action = String(log.action || '');
    if (filter === 'calls') return /^Call #/.test(action);
    if (filter === 'schedules') return /^(Follow-up|Meeting)/.test(action);
    if (filter === 'files') return log.entityType === EntityType.CASE_FILE;
    if (filter === 'notes') return /^Note /.test(action);
    return true;
};

// Admin sees the whole tenant, managers see themselves + their teams, and
// members only ever see their own report.
export const getConversionOverview = async (
    req: AuthRequest,
    res: Response,
): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user!);
        const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
        const role = req.user!.role;
        const currentUserId = String(req.user!._id);

        const now = new Date();
        const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const monthRaw = String(req.query.month || defaultMonth);
        const monthMatch = /^(\d{4})-(\d{2})$/.exec(monthRaw);
        let year = now.getFullYear();
        let month = now.getMonth() + 1;
        if (monthMatch) {
            const y = Number(monthMatch[1]);
            const m = Number(monthMatch[2]);
            if (m >= 1 && m <= 12) {
                year = y;
                month = m;
            }
        }
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 0, 23, 59, 59, 999);

        // Admins and managers get the full tenant view; members only ever see
        // their own report, regardless of what userId they pass in.
        const memberFilter: any = { tenantId: tenantObjectId };
        if (role === 'member') {
            memberFilter._id = req.user!._id;
        }

        const members = await User.find(memberFilter)
            .select('name email avatar role isActive')
            .sort({ name: 1 })
            .lean<any[]>();
        const memberIds = members.map((m: any) => String(m._id));
        const memberObjectIds = members.map((m: any) => m._id);

        let selectedUserId: string | null = null;
        const requestedUserId = String(req.query.userId || '');
        if (role === 'member') {
            selectedUserId = currentUserId;
        } else if (requestedUserId) {
            if (!memberIds.includes(requestedUserId)) {
                res.status(403).json({
                    success: false,
                    message: 'You do not have access to this user',
                });
                return;
            }
            selectedUserId = requestedUserId;
        }

        const [logs, allCaseFiles, leadTotalsRows, fileTotalRows, filesCreatedRows] =
            await Promise.all([
                ActivityLog.find({
                    user: { $in: memberObjectIds },
                    createdAt: { $gte: start, $lte: end },
                    entityType: { $in: [EntityType.LEAD, EntityType.CASE_FILE] },
                })
                    .populate('user', 'name email avatar role')
                    .sort({ createdAt: -1 })
                    .lean<any[]>(),
                CaseFile.find({ tenantId: tenantObjectId })
                    .select('leadId status productId createdBy createdAt sanctionedAt lostAt')
                    .populate('productId', 'name')
                    .lean<any[]>(),
                Lead.aggregate([
                    { $match: { tenantId: tenantObjectId } },
                    {
                        $group: {
                            _id: null,
                            total: { $sum: 1 },
                            calls: { $sum: '$callCount' },
                            followUps: { $sum: '$followUpCount' },
                            meetings: { $sum: '$meetingCount' },
                        },
                    },
                ]),
                CaseFile.aggregate([
                    { $match: { tenantId: tenantObjectId } },
                    { $group: { _id: '$status', count: { $sum: 1 } } },
                ]),
                CaseFile.aggregate([
                    {
                        $match: {
                            tenantId: tenantObjectId,
                            createdAt: { $gte: start, $lte: end },
                        },
                    },
                    { $group: { _id: '$createdBy', count: { $sum: 1 } } },
                ]),
            ]);

        // Fast lookups: caseFile id -> lead id, and lead id -> caseFile.
        const caseFileLeadById = new Map<string, string>();
        const caseFileByLeadId = new Map<string, any>();
        for (const caseFile of allCaseFiles) {
            caseFileLeadById.set(String(caseFile._id), String(caseFile.leadId));
            caseFileByLeadId.set(String(caseFile.leadId), caseFile);
        }

        const leadTotals = leadTotalsRows[0] || {
            total: 0,
            calls: 0,
            followUps: 0,
            meetings: 0,
        };
        const fileCounts = { total: 0, in_process: 0, closed: 0, lost: 0 };
        for (const row of fileTotalRows) {
            if ((fileCounts as any)[row._id] !== undefined) {
                (fileCounts as any)[row._id] = row.count;
            }
            fileCounts.total += row.count;
        }
        const decided = fileCounts.closed + fileCounts.lost;
        const conversionRate =
            decided > 0 ? Math.round((fileCounts.closed / decided) * 100) : 0;

        type TeamStat = {
            userId: string;
            user: any;
            leadsTouched: number;
            leadIds: Set<string>;
        } & Record<MetricKey, number>;

        const teamMap = new Map<string, TeamStat>();
        for (const member of members) {
            teamMap.set(String(member._id), {
                userId: String(member._id),
                user: normalizeUser(member),
                leadsTouched: 0,
                leadIds: new Set<string>(),
                ...emptyMetrics(),
            });
        }

        for (const log of logs) {
            const userId = String((log.user as any)?._id || log.user);
            const stat = teamMap.get(userId);
            if (!stat) continue;

            const action = String(log.action || '');
            const meta: any = log.metadata || {};
            const fields: string[] = Array.isArray(meta.fields) ? meta.fields : [];
            const isLeadUpdate = action === 'Lead updated';

            if (/^Call #/.test(action)) stat.calls += 1;
            if (
                /^Follow-up scheduled/.test(action) ||
                (isLeadUpdate &&
                    fields.includes('nextFollowupAt') &&
                    !fields.includes('meetingAt'))
            ) {
                stat.followUps += 1;
            }
            if (
                /^Meeting scheduled/.test(action) ||
                (isLeadUpdate &&
                    (fields.includes('meetingAt') ||
                        fields.includes('meetingMode')))
            ) {
                stat.meetings += 1;
            }
            if (/^Note (added|edited|deleted)/.test(action)) stat.notes += 1;
            if (action === 'Lead created') stat.leadsCreated += 1;
            else if (/^\d+ leads added/.test(action)) {
                stat.leadsCreated += Number(meta.count) || 1;
            }
            if (action.startsWith('File sanctioned')) stat.sanctioned += 1;
            if (action.startsWith('File marked lost')) stat.lost += 1;
            if (action.startsWith('Lead status changed')) stat.statusChanges += 1;

            const leadId =
                log.entityType === EntityType.LEAD
                    ? String(log.entityId)
                    : caseFileLeadById.get(String(log.entityId));
            if (leadId) stat.leadIds.add(leadId);
        }

        for (const row of filesCreatedRows) {
            const stat = teamMap.get(String(row._id));
            if (stat) stat.filesCreated = row.count;
        }
        for (const stat of teamMap.values()) {
            stat.leadsTouched = stat.leadIds.size;
        }

        const team = [...teamMap.values()].map((stat) => {
            const { leadIds, ...rest } = stat;
            return rest;
        });

        const scopedLogs = selectedUserId
            ? logs.filter(
                  (log) =>
                      String((log.user as any)?._id || log.user) ===
                      selectedUserId,
              )
            : logs;

        let monthly: { leadsTouched: number } & Record<MetricKey, number>;
        if (selectedUserId) {
            const stat = teamMap.get(selectedUserId);
            if (stat) {
                monthly = {
                    leadsTouched: stat.leadIds.size,
                    calls: stat.calls,
                    followUps: stat.followUps,
                    meetings: stat.meetings,
                    notes: stat.notes,
                    leadsCreated: stat.leadsCreated,
                    filesCreated: stat.filesCreated,
                    sanctioned: stat.sanctioned,
                    lost: stat.lost,
                    statusChanges: stat.statusChanges,
                };
            } else {
                monthly = { leadsTouched: 0, ...emptyMetrics() };
            }
        } else {
            const touched = new Set<string>();
            const totals = emptyMetrics();
            for (const stat of teamMap.values()) {
                stat.leadIds.forEach((id) => touched.add(id));
                (Object.keys(totals) as MetricKey[]).forEach((key) => {
                    totals[key] += stat[key];
                });
            }
            monthly = { leadsTouched: touched.size, ...totals };
        }

        const historyFilterKey = ['calls', 'schedules', 'files', 'notes'].includes(
            String(req.query.historyFilter || ''),
        )
            ? String(req.query.historyFilter)
            : 'all';
        const historyBase = scopedLogs.filter((log) =>
            matchesHistoryFilter(log, historyFilterKey),
        );
        const historyLimit = Math.min(
            500,
            Math.max(
                1,
                parseInt(String(req.query.historyLimit || '100'), 10) || 100,
            ),
        );
        const history = historyBase.slice(0, historyLimit).map((log) => {
            const meta: any = log.metadata || {};
            const entityId = String(log.entityId);
            const leadId =
                log.entityType === EntityType.LEAD
                    ? entityId
                    : caseFileLeadById.get(entityId) || null;
            const linkedCaseFile = leadId
                ? caseFileByLeadId.get(String(leadId))
                : null;
            return {
                _id: String(log._id),
                action: log.action,
                createdAt: log.createdAt,
                user: normalizeUser(log.user),
                entityType: log.entityType,
                entityId,
                leadId,
                caseFileId: linkedCaseFile
                    ? String(linkedCaseFile._id)
                    : null,
                leadName: meta.leadName || meta.name || null,
                company: meta.company || null,
                phone: meta.phone || null,
            };
        });

        // Latest activity per lead for the selected scope.
        const processedSeen = new Map<
            string,
            { leadId: string; log: any }
        >();
        for (const log of scopedLogs) {
            // Deletions stay in the history timeline, but a deleted lead/file
            // is not something the team is currently processing.
            if (/deleted/i.test(String(log.action || ''))) continue;
            const entityId = String(log.entityId);
            const leadId =
                log.entityType === EntityType.LEAD
                    ? entityId
                    : caseFileLeadById.get(entityId);
            if (!leadId || processedSeen.has(leadId)) continue;
            processedSeen.set(leadId, { leadId, log });
        }

        const processedSlice = [...processedSeen.values()].slice(0, 40);
        const processedLeadIds = processedSlice.map((entry) => entry.leadId);
        const processedLeadDocs = processedLeadIds.length
            ? await Lead.find({
                  tenantId: tenantObjectId,
                  _id: {
                      $in: processedLeadIds.map(
                          (id) => new mongoose.Types.ObjectId(id),
                      ),
                  },
              })
                  .select('name companyName phone status product')
                  .lean<any[]>()
            : [];
        const processedLeadMap = new Map(
            processedLeadDocs.map((lead: any) => [String(lead._id), lead]),
        );

        const processedLeads = processedSlice.flatMap(({ leadId, log }) => {
            const meta: any = log.metadata || {};
            const lead = processedLeadMap.get(leadId);
            // The lead was deleted later in the month — keep its history in
            // the timeline, but drop it from the "currently processed" table.
            if (!lead) return [];
            const caseFile = caseFileByLeadId.get(leadId);
            return [
                {
                    leadId,
                    caseFileId: caseFile ? String(caseFile._id) : null,
                    caseFileStatus: caseFile ? caseFile.status : null,
                    name: lead.name || meta.leadName || meta.name || 'Lead',
                    company: lead.companyName || meta.company || null,
                    phone: lead.phone || meta.phone || null,
                    product:
                        (caseFile as any)?.productId?.name ||
                        lead.product ||
                        null,
                    status: lead.status || null,
                    user: normalizeUser(log.user),
                    action: log.action,
                    at: log.createdAt,
                },
            ];
        });

        res.json({
            success: true,
            scope: {
                month: monthKey,
                start,
                end,
                userId: selectedUserId,
                role,
            },
            members: members.map(normalizeUser),
            overall: {
                leads: leadTotals.total || 0,
                calls: leadTotals.calls || 0,
                followUps: leadTotals.followUps || 0,
                meetings: leadTotals.meetings || 0,
                files: fileCounts,
                conversionRate,
            },
            monthly,
            team,
            history,
            historyTotal: historyBase.length,
            processedLeads,
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};
