import { Response } from 'express';
import mongoose from 'mongoose';
import Campaign from '../models/Campaign';
import Lead from '../models/Lead';
import ActivityLog, { EntityType } from '../models/ActivityLog';
import { AuthRequest } from '../middlewares/auth';
import XLSX from 'xlsx';
import { emitCampaignCreated, emitCampaignUpdated, emitCampaignDeleted } from '../services/crmSocketService';

export const createCampaign = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { name, purpose, description, people } = req.body;
        const tenantId = (req.user as any).tenantId?._id || (req.user as any).tenantId;

        const creatorId = req.user!._id;
        const peopleWithCreator = [...new Set([creatorId.toString(), ...(people || [])])];

        const campaign = await Campaign.create({
            name,
            purpose,
            description,
            people: peopleWithCreator,
            tenantId,
            createdBy: creatorId,
        });

        await ActivityLog.create({
            action: 'Campaign created',
            user: req.user!._id,
            entityType: EntityType.CAMPAIGN,
            entityId: campaign._id,
            metadata: { name: campaign.name },
        });

        const populated = await Campaign.findById(campaign._id).populate('people', 'name email avatar').populate('createdBy', 'name email avatar');

        const tenantId2 = (req.user as any).tenantId?._id || (req.user as any).tenantId;
        emitCampaignCreated(tenantId2, populated);

        res.status(201).json({ success: true, campaign: populated });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const getCampaigns = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = (req.user as any).tenantId?._id || (req.user as any).tenantId;

        const filter: any = { tenantId };

        if (req.user!.role !== 'admin' && req.user!.role !== 'manager') {
            filter.$or = [
                { people: req.user!._id },
                { createdBy: req.user!._id },
            ];
        }

        const campaigns = await Campaign.find(filter)
            .populate('people', 'name email avatar')
            .populate('createdBy', 'name email avatar')
            .sort({ createdAt: -1 });

        const campaignIds = campaigns.map(c => c._id);
        const leadCounts = await Lead.aggregate([
            { $match: { campaignId: { $in: campaignIds }, tenantId: new mongoose.Types.ObjectId(tenantId) } },
            { $group: { _id: '$campaignId', count: { $sum: 1 } } },
        ]);
        const countMap: Record<string, number> = {};
        leadCounts.forEach(lc => { countMap[lc._id.toString()] = lc.count; });
        const campaignsWithCounts = campaigns.map(c => ({
            ...c.toObject(),
            leadCount: countMap[c._id.toString()] || 0,
        }));

        res.json({ success: true, campaigns: campaignsWithCounts });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getCampaign = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const campaign = await Campaign.findById(req.params.id).populate('people', 'name email avatar');

        if (!campaign) {
            res.status(404).json({ success: false, message: 'Campaign not found' });
            return;
        }

        res.json({ success: true, campaign });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateCampaign = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const campaign = await Campaign.findById(req.params.id);

        if (!campaign) {
            res.status(404).json({ success: false, message: 'Campaign not found' });
            return;
        }

        const changedFields = Object.keys(req.body);
        Object.assign(campaign, req.body);

        if (req.body.people) {
            const creatorId = campaign.createdBy.toString();
            if (!req.body.people.includes(creatorId)) {
                req.body.people.push(creatorId);
            }
            campaign.people = [...new Set(req.body.people)] as mongoose.Types.ObjectId[];
        }

        await campaign.save();

        const populated = await Campaign.findById(campaign._id).populate('people', 'name email avatar');

        const tenantId = (req.user as any).tenantId?._id || (req.user as any).tenantId;
        emitCampaignUpdated(tenantId, populated);

        await ActivityLog.create({
            action: 'Campaign updated',
            user: req.user!._id,
            entityType: EntityType.CAMPAIGN,
            entityId: campaign._id,
            metadata: { name: campaign.name, fields: changedFields },
        });

        res.json({ success: true, campaign: populated });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const importCampaignExcel = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!req.file) {
            res.status(400).json({ success: false, message: 'No file uploaded' });
            return;
        }

        const tenantId = (req.user as any).tenantId?._id || (req.user as any).tenantId;
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const rows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

        if (rows.length === 0) {
            res.status(400).json({ success: false, message: 'Excel file is empty' });
            return;
        }

        const campaigns = [];
        const errors = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            try {
                if (!row.name && !row.Name && !row.NAME) {
                    errors.push({ row: i + 1, message: 'Missing name' });
                    continue;
                }

                const people = row.people || row.People || '';
                const peopleIds = people
                    ? people.split(',').map((p: string) => p.trim()).filter(Boolean)
                    : [];

                const campaign = await Campaign.create({
                    tenantId,
                    createdBy: req.user!._id,
                    name: row.name || row.Name || row.NAME || '',
                    purpose: row.purpose || row.Purpose || row.PURPOSE || '',
                    description: row.description || row.Description || '',
                    people: peopleIds,
                });

                campaigns.push(campaign);
            } catch (err: any) {
                errors.push({ row: i + 1, message: err.message });
            }
        }

        if (campaigns.length > 0) emitCampaignCreated(tenantId, campaigns[0]);

        res.status(201).json({
            success: true,
            imported: campaigns.length,
            errors,
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const downloadCampaignSampleExcel = async (_req: AuthRequest, res: Response): Promise<void> => {
    const wb = XLSX.utils.book_new();
    const headers = ['name', 'purpose', 'description', 'people'];
    const sampleData = [
        {
            name: 'Q3 Outreach',
            purpose: 'Generate leads for funding',
            description: 'Targeting early-stage startups in fintech',
            people: '',
        },
        {
            name: 'Follow-up Drive',
            purpose: 'Re-engage cold leads',
            description: 'Call back all interested leads from last quarter',
            people: '',
        },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData, { header: headers });
    XLSX.utils.book_append_sheet(wb, ws, 'Campaigns');

    const colWidths = headers.map(h => ({ wch: Math.max(h.length, 25) }));
    ws['!cols'] = colWidths;

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="campaign-import-template.xlsx"');
    res.send(buffer);
};

export const deleteCampaign = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const campaign = await Campaign.findByIdAndDelete(req.params.id);

        if (!campaign) {
            res.status(404).json({ success: false, message: 'Campaign not found' });
            return;
        }

        const tenantId3 = (req.user as any).tenantId?._id || (req.user as any).tenantId;
        emitCampaignDeleted(tenantId3, req.params.id as string);

        await ActivityLog.create({
            action: 'Campaign deleted',
            user: req.user!._id,
            entityType: EntityType.CAMPAIGN,
            entityId: campaign._id,
            metadata: { name: campaign.name },
        });

        res.json({ success: true, message: 'Campaign deleted successfully' });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};
