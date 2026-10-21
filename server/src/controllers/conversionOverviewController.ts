import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middlewares/auth';
import ActivityLog, { EntityType } from '../models/ActivityLog';
import CaseFile from '../models/CaseFile';
import Database from '../models/Database';
import Lead from '../models/Lead';
import LoanProduct from '../models/LoanProduct';
import Partner from '../models/Partner';
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

const pct = (value: number, total: number): number =>
    total > 0 ? Math.round((value / total) * 100) : 0;

const dayKey = (date: Date | string): string => {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const matchesHistoryFilter = (log: any, filter: string): boolean => {
    const action = String(log.action || '');
    if (filter === 'calls') return /^Call #/.test(action);
    if (filter === 'schedules') return /^(Follow-up|Meeting)/.test(action);
    if (filter === 'files') return log.entityType === EntityType.CASE_FILE;
    if (filter === 'notes') return /^Note /.test(action);
    return true;
};

const addMetric = (stat: any, action: string, meta: any = {}) => {
    if (/^Call #/.test(action)) stat.calls += 1;
    if (/^Follow-up scheduled/.test(action)) stat.followUps += 1;
    if (/^Meeting scheduled/.test(action)) stat.meetings += 1;
    if (/^Note (added|edited|deleted)/.test(action)) stat.notes += 1;
    if (action === 'Lead created') stat.leadsCreated += 1;
    else if (/^\d+ leads added/.test(action)) {
        stat.leadsCreated += Math.max(1, Number(meta.count) || 1);
    }
    if (action.startsWith('File sanctioned')) stat.sanctioned += 1;
    if (action.startsWith('File marked lost')) stat.lost += 1;
    if (action.startsWith('Lead status changed')) stat.statusChanges += 1;
};

type TeamStat = {
    userId: string;
    user: any;
    leadsTouched: number;
    filesOpen: number;
    filesClosed: number;
    filesLost: number;
} & Record<MetricKey, number> & {
        leadIds: Set<string>;
        activeDayKeys: Set<string>;
        lastActiveAt: Date | null;
    };

const buildTeamStats = (
    members: any[],
    logs: any[],
    caseFiles: any[],
    start: Date,
    end: Date,
    caseFileLeadById: Map<string, string>,
): TeamStat[] => {
    const map = new Map<string, TeamStat>();
    for (const member of members) {
        map.set(String(member._id), {
            userId: String(member._id),
            user: normalizeUser(member),
            leadsTouched: 0,
            filesOpen: 0,
            filesClosed: 0,
            filesLost: 0,
            ...emptyMetrics(),
            leadIds: new Set<string>(),
            activeDayKeys: new Set<string>(),
            lastActiveAt: null,
        });
    }

    for (const log of logs) {
        const userId = String((log.user as any)?._id || log.user);
        const stat = map.get(userId);
        if (!stat) continue;

        const action = String(log.action || '');
        const meta: any = log.metadata || {};
        addMetric(stat, action, meta);

        const leadId =
            log.entityType === EntityType.LEAD
                ? String(log.entityId)
                : caseFileLeadById.get(String(log.entityId));
        if (leadId) stat.leadIds.add(leadId);

        const created = new Date(log.createdAt);
        stat.activeDayKeys.add(dayKey(created));
        if (!stat.lastActiveAt || created > stat.lastActiveAt) {
            stat.lastActiveAt = created;
        }
    }

    for (const file of caseFiles) {
        if (!file.createdAt) continue;
        const createdAt = new Date(file.createdAt);
        if (createdAt < start || createdAt > end) continue;
        const userId = String(file.createdBy);
        const stat = map.get(userId);
        if (!stat) continue;

        stat.filesCreated += 1;
        if (file.status === 'closed') stat.filesClosed += 1;
        else if (file.status === 'lost') stat.filesLost += 1;
        else stat.filesOpen += 1;
        if (file.leadId) stat.leadIds.add(String(file.leadId));
    }

    return [...map.values()];
};

const summarizeStats = (stats: TeamStat[], totalMembers: number) => {
    const touched = new Set<string>();
    const totals = emptyMetrics();
    let filesOpen = 0;
    let filesClosed = 0;
    let filesLost = 0;
    let activeMembers = 0;

    for (const stat of stats) {
        stat.leadIds.forEach((id) => touched.add(id));
        (Object.keys(totals) as MetricKey[]).forEach((key) => {
            totals[key] += stat[key];
        });
        filesOpen += stat.filesOpen;
        filesClosed += stat.filesClosed;
        filesLost += stat.filesLost;
        if (stat.calls + stat.followUps + stat.meetings + stat.notes + stat.filesCreated + stat.sanctioned + stat.lost > 0) {
            activeMembers += 1;
        }
    }

    const actions =
        totals.calls +
        totals.followUps +
        totals.meetings +
        totals.notes +
        totals.statusChanges +
        totals.sanctioned +
        totals.lost;

    return {
        ...totals,
        leadsTouched: touched.size,
        filesOpen,
        filesClosed,
        filesLost,
        actions,
        activeMembers,
        totalMembers,
        fileRate: pct(totals.filesCreated, touched.size),
        winRate: pct(totals.sanctioned, totals.sanctioned + totals.lost),
        lostRate: pct(totals.lost, totals.sanctioned + totals.lost),
    };
};

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
        const prevStart = new Date(year, month - 2, 1);
        const prevEnd = new Date(year, month - 1, 0, 23, 59, 59, 999);
        const daysInMonth = new Date(year, month, 0).getDate();

        // Admins and managers get the full tenant view; members only ever see
        // their own report, regardless of what userId they pass in.
        const memberFilter: any = { tenantId: tenantObjectId };
        if (role === 'member') memberFilter._id = req.user!._id;

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

        const [
            logs,
            prevLogs,
            allCaseFiles,
            leadTotalsRows,
            fileTotalRows,
        ] = await Promise.all([
            ActivityLog.find({
                user: { $in: memberObjectIds },
                createdAt: { $gte: start, $lte: end },
                entityType: { $in: [EntityType.LEAD, EntityType.CASE_FILE] },
            })
                .populate('user', 'name email avatar role')
                .sort({ createdAt: -1 })
                .lean<any[]>(),
            ActivityLog.find({
                user: { $in: memberObjectIds },
                createdAt: { $gte: prevStart, $lte: prevEnd },
                entityType: { $in: [EntityType.LEAD, EntityType.CASE_FILE] },
            })
                .populate('user', 'name email avatar role')
                .sort({ createdAt: -1 })
                .lean<any[]>(),
            CaseFile.find({ tenantId: tenantObjectId })
                .select('leadId status productId createdBy createdAt sanctionedAt lostAt')
                .populate({ path: 'productId', model: LoanProduct, select: 'name' })
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
        ]);

        const caseFileLeadById = new Map<string, string>();
        for (const caseFile of allCaseFiles) {
            caseFileLeadById.set(String(caseFile._id), String(caseFile.leadId));
        }

        const team = buildTeamStats(
            members,
            logs,
            allCaseFiles,
            start,
            end,
            caseFileLeadById,
        );
        const prevTeam = buildTeamStats(
            members,
            prevLogs,
            allCaseFiles,
            prevStart,
            prevEnd,
            caseFileLeadById,
        );

        const scopedLogs = selectedUserId
            ? logs.filter(
                  (log) =>
                      String((log.user as any)?._id || log.user) ===
                      selectedUserId,
              )
            : logs;
        const scopedStats = selectedUserId
            ? team.filter((stat) => stat.userId === selectedUserId)
            : team;
        const scopedPrevStats = selectedUserId
            ? prevTeam.filter((stat) => stat.userId === selectedUserId)
            : prevTeam;

        const summary = summarizeStats(scopedStats, selectedUserId ? 1 : members.length);
        const previousSummary = summarizeStats(
            scopedPrevStats,
            selectedUserId ? 1 : members.length,
        );

        const monthlyFiles = allCaseFiles.filter((file) => {
            if (!file.createdAt) return false;
            const createdAt = new Date(file.createdAt);
            return createdAt >= start && createdAt <= end;
        });
        const scopedMonthlyFiles = selectedUserId
            ? monthlyFiles.filter(
                  (file) => String(file.createdBy) === selectedUserId,
              )
            : monthlyFiles;

        // Daily activity series for the selected scope.
        const daily = Array.from({ length: daysInMonth }, (_, index) => ({
            date: `${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`,
            day: index + 1,
            label: String(index + 1),
            calls: 0,
            followUps: 0,
            meetings: 0,
            notes: 0,
            filesCreated: 0,
            sanctioned: 0,
            lost: 0,
            leadsTouched: 0,
            _leadIds: new Set<string>(),
        }));

        for (const log of scopedLogs) {
            const index = new Date(log.createdAt).getDate() - 1;
            const point = daily[index];
            if (!point) continue;
            const action = String(log.action || '');
            if (/^Call #/.test(action)) point.calls += 1;
            if (/^Follow-up scheduled/.test(action)) point.followUps += 1;
            if (/^Meeting scheduled/.test(action)) point.meetings += 1;
            if (/^Note (added|edited|deleted)/.test(action)) point.notes += 1;
            if (action.startsWith('File sanctioned')) point.sanctioned += 1;
            if (action.startsWith('File marked lost')) point.lost += 1;
            const leadId =
                log.entityType === EntityType.LEAD
                    ? String(log.entityId)
                    : caseFileLeadById.get(String(log.entityId));
            if (leadId) point._leadIds.add(leadId);
        }
        for (const file of scopedMonthlyFiles) {
            const index = new Date(file.createdAt).getDate() - 1;
            const point = daily[index];
            if (point) point.filesCreated += 1;
        }
        const dailySeries = daily.map(({ _leadIds, ...point }) => ({
            ...point,
            leadsTouched: _leadIds.size,
        }));

        // Activity mix for the selected scope.
        const activityMixMap: Record<string, number> = {
            calls: 0,
            followUps: 0,
            meetings: 0,
            notes: 0,
            files: 0,
            statusChanges: 0,
            other: 0,
        };
        for (const log of scopedLogs) {
            const action = String(log.action || '');
            if (/^Call #/.test(action)) activityMixMap.calls += 1;
            else if (/^Follow-up scheduled/.test(action)) activityMixMap.followUps += 1;
            else if (/^Meeting scheduled/.test(action)) activityMixMap.meetings += 1;
            else if (/^Note (added|edited|deleted)/.test(action)) activityMixMap.notes += 1;
            else if (log.entityType === EntityType.CASE_FILE) activityMixMap.files += 1;
            else if (/^Lead status changed/.test(action)) activityMixMap.statusChanges += 1;
            else activityMixMap.other += 1;
        }
        const activityMix = [
            { key: 'calls', label: 'Calls', value: activityMixMap.calls },
            { key: 'followUps', label: 'Follow-ups', value: activityMixMap.followUps },
            { key: 'meetings', label: 'Meetings', value: activityMixMap.meetings },
            { key: 'notes', label: 'Notes', value: activityMixMap.notes },
            { key: 'files', label: 'File actions', value: activityMixMap.files },
            { key: 'statusChanges', label: 'Status changes', value: activityMixMap.statusChanges },
            { key: 'other', label: 'Other', value: activityMixMap.other },
        ].filter((item) => item.value > 0);

        // Latest activity per lead for the selected scope.
        const processedSeen = new Map<
            string,
            { leadId: string; log: any }
        >();
        for (const log of scopedLogs) {
            if (/deleted/i.test(String(log.action || ''))) continue;
            const entityId = String(log.entityId);
            const leadId =
                log.entityType === EntityType.LEAD
                    ? entityId
                    : caseFileLeadById.get(entityId);
            if (!leadId || processedSeen.has(leadId)) continue;
            processedSeen.set(leadId, { leadId, log });
        }
        const processedSlice = [...processedSeen.values()].slice(0, 100);

        // One lean lead lookup covers the pipeline, sources and processed table.
        const touchedLeadIds = new Set<string>();
        for (const log of scopedLogs) {
            const leadId =
                log.entityType === EntityType.LEAD
                    ? String(log.entityId)
                    : caseFileLeadById.get(String(log.entityId));
            if (leadId) touchedLeadIds.add(leadId);
        }
        for (const file of scopedMonthlyFiles) {
            if (file.leadId) touchedLeadIds.add(String(file.leadId));
        }
        const neededLeadIds = new Set<string>([
            ...touchedLeadIds,
            ...processedSlice.map((entry) => entry.leadId),
        ]);
        const leadDocs = neededLeadIds.size
            ? await Lead.find({
                  tenantId: tenantObjectId,
                  _id: {
                      $in: [...neededLeadIds]
                          .filter((id) => mongoose.isValidObjectId(id))
                          .map((id) => new mongoose.Types.ObjectId(id)),
                  },
              })
                  .select('name companyName phone status product databaseId partnerId sourceType source')
                  .lean<any[]>()
            : [];
        const leadMap = new Map(
            leadDocs.map((lead: any) => [String(lead._id), lead]),
        );

        // Pipeline of the leads worked in this month, by current status.
        const statusCounts = new Map<string, number>();
        for (const leadId of touchedLeadIds) {
            const lead = leadMap.get(leadId);
            if (!lead) continue;
            const status = lead.status || 'new';
            statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
        }
        const statusBreakdown = [...statusCounts.entries()]
            .map(([status, count]) => ({ status, count }))
            .sort((a, b) => b.count - a.count);

        // Where this month's converted files came from.
        const databaseCounts = new Map<string, number>();
        const partnerCounts = new Map<string, number>();
        const sourceTypeCounts = new Map<string, number>();
        for (const file of scopedMonthlyFiles) {
            const lead = leadMap.get(String(file.leadId));
            if (!lead) continue;
            if (lead.databaseId) {
                const key = String(lead.databaseId);
                databaseCounts.set(key, (databaseCounts.get(key) || 0) + 1);
            }
            if (lead.partnerId) {
                const key = String(lead.partnerId);
                partnerCounts.set(key, (partnerCounts.get(key) || 0) + 1);
            }
            const sourceType = lead.sourceType || 'udyam';
            sourceTypeCounts.set(sourceType, (sourceTypeCounts.get(sourceType) || 0) + 1);
        }

        const [databaseDocs, partnerDocs] = await Promise.all([
            databaseCounts.size
                ? Database.find({
                      tenantId: tenantObjectId,
                      _id: { $in: [...databaseCounts.keys()] },
                  })
                      .select('name')
                      .lean<any[]>()
                : [],
            partnerCounts.size
                ? Partner.find({
                      tenantId: tenantObjectId,
                      _id: { $in: [...partnerCounts.keys()] },
                  })
                      .select('companyName personName name')
                      .lean<any[]>()
                : [],
        ]);
        const databaseNameById = new Map(
            databaseDocs.map((d: any) => [String(d._id), d.name]),
        );
        const partnerNameById = new Map(
            partnerDocs.map((p: any) => [
                String(p._id),
                p.companyName || p.name || p.personName || 'Partner',
            ]),
        );

        const sources = {
            databases: [...databaseCounts.entries()]
                .map(([id, count]) => ({
                    id,
                    name: databaseNameById.get(id) || 'Unknown database',
                    count,
                }))
                .sort((a, b) => b.count - a.count),
            partners: [...partnerCounts.entries()]
                .map(([id, count]) => ({
                    id,
                    name: partnerNameById.get(id) || 'Unknown partner',
                    count,
                }))
                .sort((a, b) => b.count - a.count),
            sourceTypes: [...sourceTypeCounts.entries()]
                .map(([key, count]) => ({ key, count }))
                .sort((a, b) => b.count - a.count),
        };

        const processedLeads = processedSlice.flatMap(({ leadId, log }) => {
            const meta: any = log.metadata || {};
            const lead = leadMap.get(leadId);
            if (!lead) return [];
            const caseFile = allCaseFiles.find(
                (file: any) => String(file.leadId) === leadId,
            );
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
                ? allCaseFiles.find(
                      (file: any) => String(file.leadId) === leadId,
                  )
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

        // All-time totals remain available as context, but every KPI above is
        // month-scoped so managers never compare a monthly table to an
        // all-time headline.
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
        const allTime = {
            leads: leadTotals.total || 0,
            calls: leadTotals.calls || 0,
            followUps: leadTotals.followUps || 0,
            meetings: leadTotals.meetings || 0,
            files: fileCounts,
            conversionRate: decided > 0 ? Math.round((fileCounts.closed / decided) * 100) : 0,
        };

        const teamOut = team.map((stat) => {
            const {
                leadIds,
                activeDayKeys,
                ...rest
            } = stat;
            return {
                ...rest,
                leadsTouched: leadIds.size,
                activeDays: activeDayKeys.size,
                fileRate: pct(stat.filesCreated, leadIds.size),
                winRate: pct(stat.sanctioned, stat.sanctioned + stat.lost),
                lostRate: pct(stat.lost, stat.sanctioned + stat.lost),
                actions:
                    stat.calls +
                    stat.followUps +
                    stat.meetings +
                    stat.notes +
                    stat.statusChanges +
                    stat.sanctioned +
                    stat.lost,
            };
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
            summary,
            previousSummary,
            allTime,
            funnel: {
                leadsTouched: summary.leadsTouched,
                filesCreated: summary.filesCreated,
                sanctioned: summary.sanctioned,
                lost: summary.lost,
                filesOpen: summary.filesOpen,
                filesClosed: summary.filesClosed,
                filesLost: summary.filesLost,
                touchedToFileRate: pct(summary.filesCreated, summary.leadsTouched),
                fileToSanctionRate: pct(summary.sanctioned, summary.filesCreated),
                winRate: summary.winRate,
                cohortWinRate: pct(
                    summary.filesClosed,
                    summary.filesClosed + summary.filesLost,
                ),
            },
            daily: dailySeries,
            activityMix,
            statusBreakdown,
            sources,
            team: teamOut,
            history,
            historyTotal: historyBase.length,
            processedLeads,
            processedTotal: processedSeen.size,
            // Legacy response keys kept for any older consumers.
            overall: {
                leads: allTime.leads,
                calls: allTime.calls,
                followUps: allTime.followUps,
                meetings: allTime.meetings,
                files: allTime.files,
                conversionRate: allTime.conversionRate,
            },
            monthly: {
                leadsTouched: summary.leadsTouched,
                calls: summary.calls,
                followUps: summary.followUps,
                meetings: summary.meetings,
                notes: summary.notes,
                leadsCreated: summary.leadsCreated,
                filesCreated: summary.filesCreated,
                sanctioned: summary.sanctioned,
                lost: summary.lost,
                statusChanges: summary.statusChanges,
            },
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};
