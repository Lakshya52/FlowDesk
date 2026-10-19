import { Response } from 'express';
import mongoose from 'mongoose';
import Partner from '../models/Partner';
import Lead from '../models/Lead';
import ActivityLog, { EntityType } from '../models/ActivityLog';
import { AuthRequest } from '../middlewares/auth';
import XLSX from 'xlsx';
import { uploadToGridFS, deleteFromGridFS } from '../utils/gridfs';
import { emitPartnerCreated, emitPartnerUpdated, emitPartnerDeleted } from '../services/crmSocketService';

const displayName = (p: any): string =>
    p?.companyName || p?.name || p?.personName || 'Partner';

const normalizeEmail = (v: any): string | undefined => {
    const s = String(v || '').trim().toLowerCase();
    return s || undefined;
};

const normalizeUpper = (v: any): string | undefined => {
    const s = String(v || '').trim().toUpperCase();
    return s || undefined;
};

// GSTIN chars 3–12 are the holder's PAN (e.g. 27ABCDE1234F1Z5 → ABCDE1234F)
const panFromGst = (gst?: string): string | undefined => {
    const g = String(gst || '').trim().toUpperCase();
    if (g.length !== 15) return undefined;
    const pan = g.slice(2, 12);
    return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan) ? pan : undefined;
};

// Coerces boolean-ish form-data values ("true", "1", "yes", "on", …) to Boolean.
const toBooleanFlag = (v: any): boolean => {
    if (typeof v === 'boolean') return v;
    const s = String(v ?? '').trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes' || s === 'y' || s === 'on';
};

// Agreement upload guard: explicit type + size check (multer's shared
// fileFilter runs first, this gives a tighter cap + clearer error).
const AGREEMENT_MAX_BYTES = 10 * 1024 * 1024; // 10MB
const AGREEMENT_MIMES = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp',
]);
const AGREEMENT_EXTS = new Set(['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.webp']);

const agreementError = (file: Express.Multer.File): string | null => {
    const ext = `.${(file.originalname.split('.').pop() || '').toLowerCase()}`;
    if (!AGREEMENT_MIMES.has(file.mimetype) || !AGREEMENT_EXTS.has(ext)) {
        return `Agreement must be PDF, DOC, DOCX, JPG, PNG or WEBP (got "${file.originalname}")`;
    }
    if (file.size > AGREEMENT_MAX_BYTES) {
        return `Agreement exceeds 10MB (got ${(file.size / 1024 / 1024).toFixed(1)}MB)`;
    }
    return null;
};

export const createPartner = async (req: AuthRequest, res: Response): Promise<void> => {
    const currentUser = req.user!;
    if (currentUser.role !== 'admin' && currentUser.role !== 'manager') {
        res.status(403).json({ success: false, message: 'Only Admin or Manager can perform this action' });
        return;
    }
    let uploadedFile: string | null = null;
    try {
        const {
            partnerType = 'company',
            companyName,
            personName,
            phone,
            email,
            pan,
            gst,
            purpose,
            description,
            isCA,
            agreementSigned,
        } = req.body;

        if (!personName || !String(personName).trim()) {
            res.status(400).json({ success: false, message: 'Person name is required' });
            return;
        }
        const phoneStr = phone ? String(phone).replace(/\D/g, '') : '';
        if (!phoneStr) {
            res.status(400).json({ success: false, message: 'Contact number is required' });
            return;
        }
        if (phoneStr.length !== 10) {
            res.status(400).json({ success: false, message: 'Contact number must be 10 digits' });
            return;
        }
        const emailStr = email ? String(email).trim().toLowerCase() : '';
        if (emailStr && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
            res.status(400).json({ success: false, message: 'Invalid email id' });
            return;
        }
        const gstStr = gst ? String(gst).trim().toUpperCase() : '';
        if (gstStr && gstStr.length !== 15) {
            res.status(400).json({ success: false, message: 'GST number must be 15 characters' });
            return;
        }
        if (!['company', 'individual'].includes(partnerType)) {
            res.status(400).json({ success: false, message: 'partnerType must be company or individual' });
            return;
        }

        const tenantId = (req.user as any).tenantId?._id || (req.user as any).tenantId;
        const creatorId = req.user!._id;

        // Optional agreement upload (multipart field name: "agreement")
        let agreement: any = {};
        if ((req as any).file) {
            const file = (req as any).file;
            const err = agreementError(file);
            if (err) {
                res.status(400).json({ success: false, message: err });
                return;
            }
            const { filename } = await uploadToGridFS(file.buffer, file.originalname, file.mimetype);
            uploadedFile = filename;
            agreement = {
                agreementFileName: filename,
                agreementOriginalName: file.originalname,
                agreementFilePath: `/uploads/${filename}`,
                agreementFileType: file.mimetype,
                agreementFileSize: file.size,
            };
        }

        const trimmedCompany = companyName ? String(companyName).trim() : undefined;
        const normGst = normalizeUpper(gst);
        const normPan = normalizeUpper(pan) || panFromGst(normGst);
        const isCACandidate = toBooleanFlag(isCA);
        const agreementSignedFlag = toBooleanFlag(agreementSigned);

        const partner = await Partner.create({
            partnerType,
            companyName: trimmedCompany,
            personName: String(personName).trim(),
            phone: phoneStr,
            email: normalizeEmail(email),
            pan: normPan,
            gst: normGst,
            purpose: purpose ? String(purpose).trim() : undefined,
            description: description ? String(description).trim() : undefined,
            isCA: isCACandidate,
            // Uploading an agreement document implies the agreement is signed
            agreementSigned: (req as any).file ? true : agreementSignedFlag,
            // Legacy alias so old UI/indexes keep working
            name: trimmedCompany || String(personName).trim(),
            tenantId,
            createdBy: creatorId,
            ...agreement,
        });

        await ActivityLog.create({
            action: 'Partner created',
            user: req.user!._id,
            entityType: EntityType.PARTNER,
            entityId: partner._id,
            metadata: { name: displayName(partner) },
        });

        const populated = await Partner.findById(partner._id).populate('createdBy', 'name email avatar');

        emitPartnerCreated(tenantId, populated);

        res.status(201).json({ success: true, partner: populated });
    } catch (error: any) {
        if (uploadedFile) {
            await deleteFromGridFS(uploadedFile).catch(() => undefined);
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

export const getPartners = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = (req.user as any).tenantId?._id || (req.user as any).tenantId;
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.max(1, parseInt(req.query.limit as string) || 100000);
        const skip = (page - 1) * limit;
        const search = String(req.query.search || '').trim();
        const isCAParam = String(req.query.isCA || '').toLowerCase();

        const filter: any = { tenantId };
        if (search) {
            const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const rx = new RegExp(escaped, 'i');
            const searchOr: any[] = [
                { companyName: rx },
                { name: rx },
                { personName: rx },
                { phone: rx },
                { email: rx },
                { pan: rx },
                { gst: rx },
                { purpose: rx },
                { description: rx },
            ];
            // Phone-friendly search: "98765 43210", "98765-43210" and
            // "+91 98765 43210" should still match a stored 10-digit number.
            const digits = search.replace(/\D/g, '');
            if (digits && digits !== search) {
                searchOr.push({ phone: new RegExp(digits) });
            }
            if (digits.length > 10) {
                searchOr.push({ phone: new RegExp(digits.slice(-10)) });
            }
            filter.$or = searchOr;
        }
        if (isCAParam === 'true' || isCAParam === '1') {
            filter.isCA = true;
        } else if (isCAParam === 'false' || isCAParam === '0') {
            filter.isCA = { $ne: true };
        }

        const [partners, total] = await Promise.all([
            Partner.find(filter)
                .populate('createdBy', 'name email avatar')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Partner.countDocuments(filter),
        ]);

        const partnerIds = partners.map(p => p._id);
        const leadCounts = partnerIds.length
            ? await Lead.aggregate([
                { $match: { partnerId: { $in: partnerIds }, tenantId: new mongoose.Types.ObjectId(tenantId as any) } },
                { $group: { _id: '$partnerId', count: { $sum: 1 } } },
            ])
            : [];
        const countMap: Record<string, number> = {};
        leadCounts.forEach((lc: any) => { countMap[lc._id.toString()] = lc.count; });
        const withCounts = partners.map(p => ({
            ...p.toObject(),
            leadCount: countMap[(p._id as any).toString()] || 0,
        }));

        res.json({
            success: true,
            partners: withCounts,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getPartner = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = (req.user as any).tenantId?._id || (req.user as any).tenantId;
        const partner = await Partner.findOne({ _id: req.params.id, tenantId }).populate('createdBy', 'name email avatar');

        if (!partner) {
            res.status(404).json({ success: false, message: 'Partner not found' });
            return;
        }

        res.json({ success: true, partner });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updatePartner = async (req: AuthRequest, res: Response): Promise<void> => {
    const currentUser = req.user!;
    if (currentUser.role !== 'admin' && currentUser.role !== 'manager') {
        res.status(403).json({ success: false, message: 'Only Admin or Manager can perform this action' });
        return;
    }
    // Tracks GridFS files so failures never orphan or lose agreements:
    // - uploadedFile: newly uploaded file, deleted if save fails
    // - replacedFile: previous file, deleted only after save succeeds
    let uploadedFile: string | null = null;
    let replacedFile: string | null = null;
    try {
        const tenantId = (req.user as any).tenantId?._id || (req.user as any).tenantId;
        const partner = await Partner.findOne({ _id: req.params.id, tenantId });

        if (!partner) {
            res.status(404).json({ success: false, message: 'Partner not found' });
            return;
        }

        const changedFields = Object.keys(req.body || {});
        if ((req as any).file) changedFields.push('agreement');

        const protectedFields = ['tenantId', 'createdBy', '_id', 'people'];
        const sanitizedBody: any = { ...req.body };
        for (const field of protectedFields) {
            delete sanitizedBody[field];
        }
        // Never allow client to set stored file pointers directly
        delete sanitizedBody.agreementFileName;
        delete sanitizedBody.agreementOriginalName;
        delete sanitizedBody.agreementFilePath;
        delete sanitizedBody.agreementFileType;
        delete sanitizedBody.agreementFileSize;
        // Legacy alias is derived, not set directly
        delete sanitizedBody.name;

        if (sanitizedBody.personName !== undefined) {
            if (!String(sanitizedBody.personName).trim()) {
                res.status(400).json({ success: false, message: 'Person name cannot be empty' });
                return;
            }
            sanitizedBody.personName = String(sanitizedBody.personName).trim();
        }
        if (sanitizedBody.companyName !== undefined) {
            sanitizedBody.companyName = String(sanitizedBody.companyName || '').trim() || undefined;
        }
        if (sanitizedBody.partnerType !== undefined && !['company', 'individual'].includes(sanitizedBody.partnerType)) {
            res.status(400).json({ success: false, message: 'partnerType must be company or individual' });
            return;
        }
        if (sanitizedBody.email !== undefined) {
            const em = String(sanitizedBody.email || '').trim().toLowerCase();
            if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
                res.status(400).json({ success: false, message: 'Invalid email id' });
                return;
            }
            sanitizedBody.email = em || undefined;
        }
        if (sanitizedBody.pan !== undefined) sanitizedBody.pan = normalizeUpper(sanitizedBody.pan);
        if (sanitizedBody.gst !== undefined) {
            const gz = String(sanitizedBody.gst || '').trim().toUpperCase();
            if (gz && gz.length !== 15) {
                res.status(400).json({ success: false, message: 'GST number must be 15 characters' });
                return;
            }
            sanitizedBody.gst = gz || undefined;
            if (sanitizedBody.pan === undefined && sanitizedBody.gst) {
                const derived = panFromGst(sanitizedBody.gst);
                if (derived) sanitizedBody.pan = derived;
            }
        }
        if (sanitizedBody.phone !== undefined) {
            const ph = String(sanitizedBody.phone || '').replace(/\D/g, '');
            if (ph && ph.length !== 10) {
                res.status(400).json({ success: false, message: 'Contact number must be 10 digits' });
                return;
            }
            sanitizedBody.phone = ph || undefined;
        }
        if (sanitizedBody.purpose !== undefined) sanitizedBody.purpose = String(sanitizedBody.purpose || '').trim() || undefined;
        if (sanitizedBody.description !== undefined) sanitizedBody.description = String(sanitizedBody.description || '').trim() || undefined;
        if (sanitizedBody.isCA !== undefined) {
            sanitizedBody.isCA = toBooleanFlag(sanitizedBody.isCA);
        }
        if (sanitizedBody.agreementSigned !== undefined) {
            sanitizedBody.agreementSigned = toBooleanFlag(sanitizedBody.agreementSigned);
        }

        Object.assign(partner, sanitizedBody);

        // Agreement replace / remove (old file deleted only after save succeeds)
        if ((req as any).file) {
            const file = (req as any).file;
            const err = agreementError(file);
            if (err) {
                res.status(400).json({ success: false, message: err });
                return;
            }
            const { filename } = await uploadToGridFS(file.buffer, file.originalname, file.mimetype);
            uploadedFile = filename;
            replacedFile = (partner as any).agreementFileName || null;
            (partner as any).agreementFileName = filename;
            (partner as any).agreementOriginalName = file.originalname;
            (partner as any).agreementFilePath = `/uploads/${filename}`;
            (partner as any).agreementFileType = file.mimetype;
            (partner as any).agreementFileSize = file.size;
            // A stored document implies the agreement is signed
            (partner as any).agreementSigned = true;
        } else if (req.body.removeAgreement === 'true' || req.body.removeAgreement === true) {
            if ((partner as any).agreementFileName) {
                replacedFile = (partner as any).agreementFileName;
            }
            (partner as any).agreementFileName = undefined;
            (partner as any).agreementOriginalName = undefined;
            (partner as any).agreementFilePath = undefined;
            (partner as any).agreementFileType = undefined;
            (partner as any).agreementFileSize = undefined;
        }

        // Keep legacy alias in sync
        (partner as any).name = (partner as any).companyName || (partner as any).personName;

        await partner.save();

        if (replacedFile) {
            await deleteFromGridFS(replacedFile);
        }

        const populated = await Partner.findById(partner._id).populate('createdBy', 'name email avatar');

        emitPartnerUpdated(tenantId, populated);

        await ActivityLog.create({
            action: 'Partner updated',
            user: req.user!._id,
            entityType: EntityType.PARTNER,
            entityId: partner._id,
            metadata: { name: displayName(partner), fields: changedFields },
        });

        res.json({ success: true, partner: populated });
    } catch (error: any) {
        if (uploadedFile) {
            await deleteFromGridFS(uploadedFile).catch(() => undefined);
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

const pick = (row: any, ...keys: string[]): string => {
    for (const k of keys) {
        if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return String(row[k]).trim();
    }
    return '';
};

export const importPartnerExcel = async (req: AuthRequest, res: Response): Promise<void> => {
    const currentUser = req.user!;
    if (currentUser.role !== 'admin' && currentUser.role !== 'manager') {
        res.status(403).json({ success: false, message: 'Only Admin or Manager can import partners' });
        return;
    }
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

        if (rows.length > 1000) {
            res.status(400).json({ success: false, message: 'Excel file has too many rows (max 1000 per import)' });
            return;
        }

        // Duplicate detection against already-saved partners
        const rowPhones = rows
            .map((r: any) => pick(r, 'phone', 'Phone', 'Contact', 'contactNumber', 'Contact Number').replace(/\D/g, ''))
            .filter(Boolean);
        const rowEmails = rows
            .map((r: any) => pick(r, 'email', 'Email', 'Email Id').toLowerCase())
            .filter(Boolean);
        const [existingPhones, existingEmails] = await Promise.all([
            rowPhones.length ? Partner.find({ tenantId, phone: { $in: rowPhones } }).select('phone').lean() : [],
            rowEmails.length ? Partner.find({ tenantId, email: { $in: rowEmails } }).select('email').lean() : [],
        ]);
        const existingPhoneSet = new Set(existingPhones.map((p: any) => p.phone));
        const existingEmailSet = new Set(existingEmails.map((p: any) => (p.email || '').toLowerCase()));
        const seenPhones = new Set<string>();
        const seenEmails = new Set<string>();

        const partners = [];
        const errors = [];

        const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNo = i + 1;
            try {
                const personName = pick(row, 'personName', 'Person Name', 'person_name', 'PERSON');
                const companyName = pick(row, 'companyName', 'Company Name', 'company_name', 'COMPANY', 'name', 'Name');
                if (!personName) {
                    errors.push({ row: rowNo, message: 'Missing person name (required)' });
                    continue;
                }

                const phone = pick(row, 'phone', 'Phone', 'Contact', 'contactNumber', 'Contact Number').replace(/\D/g, '');
                if (!phone) {
                    errors.push({ row: rowNo, message: 'Missing contact number (required)' });
                    continue;
                }
                if (phone.length !== 10) {
                    errors.push({ row: rowNo, message: `Invalid contact number "${phone}" (must be 10 digits)` });
                    continue;
                }
                if (existingPhoneSet.has(phone) || seenPhones.has(phone)) {
                    errors.push({ row: rowNo, message: `Duplicate contact number: ${phone}` });
                    continue;
                }

                const email = pick(row, 'email', 'Email', 'Email Id').toLowerCase() || undefined;
                if (email && !EMAIL_RE.test(email)) {
                    errors.push({ row: rowNo, message: `Invalid email "${email}"` });
                    continue;
                }
                if (email && (existingEmailSet.has(email) || seenEmails.has(email))) {
                    errors.push({ row: rowNo, message: `Duplicate email: ${email}` });
                    continue;
                }

                const gstVal = pick(row, 'gst', 'GST', 'Gst Number')?.toUpperCase() || undefined;
                if (gstVal && gstVal.length !== 15) {
                    errors.push({ row: rowNo, message: `Invalid GST "${gstVal}" (must be 15 characters)` });
                    continue;
                }
                let panVal = pick(row, 'pan', 'PAN', 'Pan Number')?.toUpperCase() || undefined;
                if (!panVal && gstVal) panVal = panFromGst(gstVal);

                const rawType = pick(row, 'partnerType', 'Partner Type', 'type', 'Type').toLowerCase();
                let partnerType: 'company' | 'individual' = 'company';
                if (rawType) {
                    if (rawType.startsWith('indiv')) partnerType = 'individual';
                    else if (!rawType.startsWith('comp')) {
                        errors.push({ row: rowNo, message: 'Invalid partnerType (allowed: company, individual)' });
                        continue;
                    }
                }

                const rawCA = pick(row, 'isCA', 'Is CA', 'is_ca', 'CA', 'CA Firm', 'Is CA Firm', 'ca firm').toLowerCase();
                const isCA = ['true', '1', 'yes', 'y', 'on', 'ca', 'cafirm', 'ca firm'].includes(rawCA);

                const rawAgreement = pick(row, 'agreementSigned', 'Agreement Signed', 'agreement_signed', 'Is Agreement Signed', 'isAgreementSigned', 'Agreement').toLowerCase();
                const agreementSigned = toBooleanFlag(rawAgreement) || rawAgreement === 'signed';

                const partner = await Partner.create({
                    tenantId,
                    createdBy: req.user!._id,
                    partnerType,
                    companyName: companyName || undefined,
                    personName,
                    phone,
                    email,
                    pan: panVal,
                    gst: gstVal,
                    purpose: pick(row, 'purpose', 'Purpose', 'Role') || undefined,
                    description: pick(row, 'description', 'Description') || undefined,
                    isCA,
                    agreementSigned,
                    name: companyName || personName,
                });

                seenPhones.add(phone);
                if (email) seenEmails.add(email);
                partners.push(partner);
            } catch (err: any) {
                errors.push({ row: rowNo, message: err.message });
            }
        }

        if (partners.length > 0) emitPartnerCreated(tenantId, partners[0]);

        await ActivityLog.create({
            action: `${partners.length} partners imported via Excel`,
            user: req.user!._id,
            entityType: EntityType.PARTNER,
            entityId: partners[0]?._id || req.user!._id,
            metadata: { count: partners.length, errors: errors.length },
        });

        res.status(201).json({
            success: true,
            total: rows.length,
            imported: partners.length,
            errors,
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const downloadPartnerSampleExcel = async (_req: AuthRequest, res: Response): Promise<void> => {
    const wb = XLSX.utils.book_new();
    const headers = ['partnerType', 'companyName', 'personName', 'phone', 'email', 'gst', 'pan', 'purpose', 'description', 'isCA', 'agreementSigned'];
    const sampleData = [
        {
            partnerType: 'company',
            companyName: 'Acme Corp',
            personName: 'Rahul Sharma',
            phone: '9876543210',
            email: 'rahul@acme.com',
            gst: '27ABCDE1234F1Z5',
            pan: 'ABCDE1234F',
            purpose: 'Channel partner for west region',
            description: 'Handles enterprise referrals',
            isCA: 'false',
            agreementSigned: 'true',
        },
        {
            partnerType: 'individual',
            companyName: '',
            personName: 'Priya Nair',
            phone: '9898989898',
            email: 'priya@example.com',
            gst: '',
            pan: '',
            purpose: 'Freelance referrer',
            description: '',
            isCA: 'true',
            agreementSigned: 'false',
        },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData, { header: headers });
    XLSX.utils.book_append_sheet(wb, ws, 'Partners');

    const colWidths = headers.map(h => ({ wch: Math.max(h.length, 22) }));
    ws['!cols'] = colWidths;
    if (ws['!ref']) (ws as any)['!autofilter'] = { ref: ws['!ref'] };

    const instructions = [
        ['Partner Import – Instructions (read first, then fill the Partners sheet)'],
        ['Fill one partner per row on the Partners sheet. Do not rename the column headers.'],
        [],
        ['Column', 'Required?', 'Notes'],
        ['partnerType', 'No', 'company or individual (default company)'],
        ['companyName', 'No', 'Company name (shown as the partner title when present)'],
        ['personName', 'Yes', 'Contact person name'],
        ['phone', 'Yes', '10 digits; duplicates (in file or already saved) are skipped with an error'],
        ['email', 'No', 'Must be a valid email when given; duplicates are skipped'],
        ['gst', 'No', '15 characters'],
        ['pan', 'No', 'Auto-filled from gst when left blank'],
        ['purpose / description', 'No', 'Free text'],
        ['isCA', 'No', 'true/false, 1/0, yes/no (marks as CA or CA Firm depending on partnerType)'],
        ['agreementSigned', 'No', 'Yes/No (true/1/on also accepted). Marks the agreement as signed. A document cannot be attached via Excel — open the partner afterwards to upload the agreement file.'],
        [],
        ['Limits', '', 'Max 1000 rows per import. Rows with errors are skipped; the rest are imported.'],
    ];
    const wsHelp = XLSX.utils.aoa_to_sheet(instructions);
    wsHelp['!cols'] = [{ wch: 30 }, { wch: 30 }, { wch: 90 }];
    XLSX.utils.book_append_sheet(wb, wsHelp, 'Instructions');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="partner-import-template.xlsx"');
    res.send(buffer);
};

export const deletePartner = async (req: AuthRequest, res: Response): Promise<void> => {
    const currentUser = req.user!;
    if (currentUser.role !== 'admin' && currentUser.role !== 'manager') {
        res.status(403).json({ success: false, message: 'Only Admin or Manager can perform this action' });
        return;
    }
    try {
        const tenantId = (req.user as any).tenantId?._id || (req.user as any).tenantId;
        const partner = await Partner.findOneAndDelete({ _id: req.params.id, tenantId });

        if (!partner) {
            res.status(404).json({ success: false, message: 'Partner not found' });
            return;
        }

        if ((partner as any).agreementFileName) {
            await deleteFromGridFS((partner as any).agreementFileName);
        }

        // Keep referred leads, just unlink them from the deleted partner
        await Lead.updateMany(
            { partnerId: partner._id, tenantId },
            { $unset: { partnerId: 1 } },
        );

        emitPartnerDeleted(tenantId, req.params.id as string);

        await ActivityLog.create({
            action: 'Partner deleted',
            user: req.user!._id,
            entityType: EntityType.PARTNER,
            entityId: partner._id,
            metadata: { name: displayName(partner) },
        });

        res.json({ success: true, message: 'Partner deleted successfully' });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};
