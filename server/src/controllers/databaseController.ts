import { Response } from 'express';
import mongoose from 'mongoose';
import Database from '../models/Database';
import Lead from '../models/Lead';
import ActivityLog, { EntityType } from '../models/ActivityLog';
import { AuthRequest } from '../middlewares/auth';
import XLSX from 'xlsx';
import { emitDatabaseCreated, emitDatabaseUpdated, emitDatabaseDeleted } from '../services/crmSocketService';

export const createDatabase = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { name, purpose, description, people } = req.body;
        const tenantId = (req.user as any).tenantId?._id || (req.user as any).tenantId;

        const creatorId = req.user!._id;
        const peopleWithCreator = [...new Set([creatorId.toString(), ...(people || [])])];

        const database = await Database.create({
            name,
            purpose,
            description,
            people: peopleWithCreator,
            tenantId,
            createdBy: creatorId,
        });

        await ActivityLog.create({
            action: 'Database created',
            user: req.user!._id,
            entityType: EntityType.DATABASE,
            entityId: database._id,
            metadata: { name: database.name },
        });

        const populated = await Database.findById(database._id).populate('people', 'name email avatar').populate('createdBy', 'name email avatar');

        const tenantId2 = (req.user as any).tenantId?._id || (req.user as any).tenantId;
        emitDatabaseCreated(tenantId2, populated);

        res.status(201).json({ success: true, database: populated });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const getDatabases = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = (req.user as any).tenantId?._id || (req.user as any).tenantId;

        const filter: any = { tenantId };

        if (req.user!.role !== 'admin' && req.user!.role !== 'manager') {
            filter.$or = [
                { people: req.user!._id },
                { createdBy: req.user!._id },
            ];
        }

        const databases = await Database.find(filter)
            .populate('people', 'name email avatar')
            .populate('createdBy', 'name email avatar')
            .sort({ createdAt: -1 });

        const databaseIds = databases.map(c => c._id);
        const leadCounts = await Lead.aggregate([
            { $match: { databaseId: { $in: databaseIds }, tenantId: new mongoose.Types.ObjectId(tenantId) } },
            { $group: { _id: '$databaseId', count: { $sum: 1 } } },
        ]);
        const countMap: Record<string, number> = {};
        leadCounts.forEach(lc => { countMap[lc._id.toString()] = lc.count; });
        const databasesWithCounts = databases.map(c => ({
            ...c.toObject(),
            leadCount: countMap[c._id.toString()] || 0,
        }));

        res.json({ success: true, databases: databasesWithCounts });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getDatabase = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const database = await Database.findById(req.params.id).populate('people', 'name email avatar');

        if (!database) {
            res.status(404).json({ success: false, message: 'Database not found' });
            return;
        }

        res.json({ success: true, database });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateDatabase = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const database = await Database.findById(req.params.id);

        if (!database) {
            res.status(404).json({ success: false, message: 'Database not found' });
            return;
        }

		const changedFields = Object.keys(req.body);

		const protectedFields = ['tenantId', 'createdBy', '_id'];
		const sanitizedBody = { ...req.body };
		for (const field of protectedFields) {
			delete sanitizedBody[field];
		}
		Object.assign(database, sanitizedBody);

		if (req.body.people) {
            const creatorId = database.createdBy.toString();
            if (!req.body.people.includes(creatorId)) {
                req.body.people.push(creatorId);
            }
            database.people = [...new Set(req.body.people)] as mongoose.Types.ObjectId[];
        }

        await database.save();

        const populated = await Database.findById(database._id).populate('people', 'name email avatar');

        const tenantId = (req.user as any).tenantId?._id || (req.user as any).tenantId;
        emitDatabaseUpdated(tenantId, populated);

        await ActivityLog.create({
            action: 'Database updated',
            user: req.user!._id,
            entityType: EntityType.DATABASE,
            entityId: database._id,
            metadata: { name: database.name, fields: changedFields },
        });

        res.json({ success: true, database: populated });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const importDatabaseExcel = async (req: AuthRequest, res: Response): Promise<void> => {
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

        const databases = [];
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

                const database = await Database.create({
                    tenantId,
                    createdBy: req.user!._id,
                    name: row.name || row.Name || row.NAME || '',
                    purpose: row.purpose || row.Purpose || row.PURPOSE || '',
                    description: row.description || row.Description || '',
                    people: peopleIds,
                });

                databases.push(database);
            } catch (err: any) {
                errors.push({ row: i + 1, message: err.message });
            }
        }

        if (databases.length > 0) emitDatabaseCreated(tenantId, databases[0]);

        res.status(201).json({
            success: true,
            imported: databases.length,
            errors,
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const downloadDatabaseSampleExcel = async (_req: AuthRequest, res: Response): Promise<void> => {
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
    XLSX.utils.book_append_sheet(wb, ws, 'Databases');

    const colWidths = headers.map(h => ({ wch: Math.max(h.length, 25) }));
    ws['!cols'] = colWidths;

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="database-import-template.xlsx"');
    res.send(buffer);
};

export const deleteDatabase = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId3 = (req.user as any).tenantId?._id || (req.user as any).tenantId;
        const database = await Database.findOneAndDelete({ _id: req.params.id, tenantId: tenantId3 });

        if (!database) {
            res.status(404).json({ success: false, message: 'Database not found' });
            return;
        }

        // Optional cascade: ?deleteLeads=true removes the database's leads as well.
        // Otherwise kept leads are unlinked (databaseId unset) so they don't point
        // at a deleted database and stay visible under the "no database" filter.
        const deleteLeads = req.query.deleteLeads === 'true' || (req.body as any)?.deleteLeads === true;
        let deletedLeads = 0;
        let keptLeads = 0;
        if (deleteLeads) {
            const r = await Lead.deleteMany({ databaseId: database._id, tenantId: tenantId3 });
            deletedLeads = r.deletedCount ?? 0;
        } else {
            const r = await Lead.updateMany(
                { databaseId: database._id, tenantId: tenantId3 },
                { $unset: { databaseId: 1 } },
            );
            keptLeads = (r as any).modifiedCount ?? 0;
        }

        emitDatabaseDeleted(tenantId3, req.params.id as string);

        await ActivityLog.create({
            action: 'Database deleted',
            user: req.user!._id,
            entityType: EntityType.DATABASE,
            entityId: database._id,
            metadata: { name: database.name, deleteLeads, deletedLeads, keptLeads },
        });

        res.json({
            success: true,
            message: deleteLeads
                ? `Database deleted with ${deletedLeads} lead${deletedLeads !== 1 ? 's' : ''}`
                : 'Database deleted successfully',
            deletedLeads,
            keptLeads,
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};
