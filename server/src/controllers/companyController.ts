import { Request, Response } from 'express';
import Company from '../models/Company';
import Contact from '../models/Contact';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import multer from 'multer';
import { sendGenericEmail } from '../services/emailService';
import ActivityLog, { EntityType } from '../models/ActivityLog';
import { AuthRequest } from '../middlewares/auth';
import { getTenantId } from '../utils/tenant';

const upload = multer({ storage: multer.memoryStorage() });

// Create Company
export const createCompany = async (req: AuthRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req.user);
        const { name, parentCompanyId, industry, description, website, email, phone, phoneCountryCode, address, status } = req.body;
        
        let slug = name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        const existing = await Company.findOne({ slug, tenantId });
        if (existing) {
            slug = `${slug}-${Date.now()}`;
        }

        const companyData: any = {
            name,
            slug,
            tenantId,
            parentCompanyId: parentCompanyId || null,
            industry,
            description,
            website,
            email,
            phone,
            phoneCountryCode: phoneCountryCode || '+91',
            address,
            status: status || 'active',
        };

        const company = await Company.create(companyData);

        await ActivityLog.create({
            action: 'Company created',
            user: req.user!._id,
            entityType: EntityType.COMPANY,
            entityId: company._id,
            metadata: { name: company.name },
        });

        res.status(201).json({ success: true, company });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// Get All Companies (with hierarchy)
export const getCompanies = async (req: Request, res: Response) => {
    try {
        const tenantId = getTenantId((req as any).user);
        const { flat } = req.query;

        // Return flat list of all companies for this tenant
        if (flat === 'true') {
            const allCompanies = await Company.find({ tenantId }).select('_id name parentCompanyId').sort({ name: 1 }).lean();
            res.json({ success: true, companies: allCompanies });
            return;
        }

        const allCompanies = await Company.find({ tenantId }).populate('contacts').lean();

        const companyMap = new Map();
        const rootCompanies: any[] = [];

        // Initialize children arrays and map
        allCompanies.forEach(company => {
            (company as any).children = [];
            companyMap.set(company._id.toString(), company);
        });

        // Link children to parents
        allCompanies.forEach(company => {
            if (company.parentCompanyId) {
                const parentIdStr = company.parentCompanyId.toString();
                const parent = companyMap.get(parentIdStr);
                if (parent) {
                    parent.children.push(company);
                } else {
                    rootCompanies.push(company);
                }
            } else {
                rootCompanies.push(company);
            }
        });

        res.json({ success: true, companies: rootCompanies });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get Single Company with contacts and child companies
export const getCompany = async (req: Request, res: Response) => {
    try {
        const tenantId = getTenantId((req as any).user);
        const company = await Company.findOne({ _id: req.params.id, tenantId })
            .populate('contacts')
            .populate('childCompanies');

        if (!company) {
            return res.status(404).json({ success: false, message: 'Company not found' });
        }

        res.json({ success: true, company });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Update Company
export const updateCompany = async (req: AuthRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req.user);
        const { name, parentCompanyId, industry, description, website, email, phone, phoneCountryCode, address, status } = req.body;

        const updateData: any = {
            name,
            parentCompanyId: parentCompanyId === '' ? null : (parentCompanyId || null),
            industry,
            description,
            website,
            email,
            phone,
            phoneCountryCode,
            address,
            status
        };

        const company = await Company.findOne({ _id: req.params.id, tenantId });
        if (!company) {
            return res.status(404).json({ success: false, message: 'Company not found' });
        }

        // Capture changes
        const changes: Record<string, { old: any, new: any }> = {};
        Object.keys(updateData).forEach(key => {
            const oldValue = (company as any)[key];
            const newValue = updateData[key];
            if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
                changes[key] = { old: oldValue, new: newValue };
            }
        });

        Object.assign(company, updateData);
        await company.save();

        await ActivityLog.create({
            action: 'Company updated',
            user: req.user!._id,
            entityType: EntityType.COMPANY,
            entityId: company._id,
            metadata: { 
                name: company.name, 
                changes 
            },
        });

        res.json({ success: true, company });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// Delete Company
export const deleteCompany = async (req: AuthRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req.user);
        const company = await Company.findOneAndDelete({ _id: req.params.id, tenantId });

        if (!company) {
            return res.status(404).json({ success: false, message: 'Company not found' });
        }

        // Delete all contacts associated with this company
        await Contact.deleteMany({ companyId: req.params.id, tenantId });

        // Recursively delete child companies within the same tenant
        const childCompanies = await Company.find({ parentCompanyId: req.params.id, tenantId });
        for (const child of childCompanies) {
            await Company.findByIdAndDelete(child._id);
            await Contact.deleteMany({ companyId: child._id, tenantId });
            // Recursively delete deeper levels
            const deeperChildren = await Company.find({ parentCompanyId: child._id, tenantId });
            for (const grandchild of deeperChildren) {
                await Company.findByIdAndDelete(grandchild._id);
                await Contact.deleteMany({ companyId: grandchild._id, tenantId });
            }
        }

        await ActivityLog.create({
            action: 'Company deleted',
            user: req.user!._id,
            entityType: EntityType.COMPANY,
            entityId: company._id,
            metadata: { name: company.name },
        });

        res.json({ success: true, message: 'Company deleted successfully' });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get Company Contacts
export const getCompanyContacts = async (req: Request, res: Response) => {
    try {
        const tenantId = getTenantId((req as any).user);
        const contacts = await Contact.find({ companyId: req.params.id, tenantId });
        res.json({ success: true, contacts });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Create Contact
export const createContact = async (req: AuthRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req.user);
        const { name, email, phone, position, department, isPrimary, notes } = req.body;

        // If primary, unset other primary contacts within tenant
        if (isPrimary) {
            await Contact.updateMany(
                { companyId: req.params.id, tenantId, isPrimary: true },
                { isPrimary: false }
            );
        }

        const contact = await Contact.create({
            companyId: req.params.id,
            tenantId,
            name,
            email,
            phone,
            position,
            department,
            isPrimary: isPrimary || false,
            notes,
        });

        res.status(201).json({ success: true, contact });

        await ActivityLog.create({
            action: 'Contact created',
            user: req.user!._id,
            entityType: EntityType.CONTACT,
            entityId: contact._id,
            metadata: { name: contact.name, companyId: req.params.id },
        });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// Update Contact
export const updateContact = async (req: AuthRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req.user);
        const { name, email, phone, position, department, isPrimary, notes } = req.body;

        // If setting as primary, unset other primary contacts within tenant
        if (isPrimary) {
            await Contact.updateMany(
                { companyId: req.params.id, tenantId, isPrimary: true, _id: { $ne: req.params.contactId } },
                { isPrimary: false }
            );
        }

        const contact = await Contact.findOne({ _id: req.params.contactId, tenantId });
        if (!contact) {
            return res.status(404).json({ success: false, message: 'Contact not found' });
        }

        const oldValue = contact.toObject();
        
        Object.assign(contact, { name, email, phone, position, department, isPrimary, notes });
        await contact.save();

        // Capture changes
        const changes: Record<string, { old: any, new: any }> = {};
        const fields = ['name', 'email', 'phone', 'position', 'department', 'isPrimary', 'notes'];
        fields.forEach(field => {
            const oldVal = (oldValue as any)[field];
            const newVal = (contact as any)[field];
            if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
                changes[field] = { old: oldVal, new: newVal };
            }
        });

        await ActivityLog.create({
            action: 'Contact updated',
            user: req.user!._id,
            entityType: EntityType.CONTACT,
            entityId: contact._id,
            metadata: { 
                name: contact.name, 
                companyId: contact.companyId,
                changes 
            },
        });

        res.json({ success: true, contact });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// Delete Contact
export const deleteContact = async (req: AuthRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req.user);
        const contact = await Contact.findOneAndDelete({ _id: req.params.contactId, tenantId });

        if (!contact) {
            return res.status(404).json({ success: false, message: 'Contact not found' });
        }

        await ActivityLog.create({
            action: 'Contact deleted',
            user: req.user!._id,
            entityType: EntityType.CONTACT,
            entityId: contact._id,
            metadata: { name: contact.name },
        });

        res.json({ success: true, message: 'Contact deleted successfully' });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get Company Projects (placeholder)
export const getCompanyProjects = async (req: Request, res: Response) => {
    res.json({ success: true, projects: [], message: 'Project integration coming soon' });
};

// Import Companies from Excel
export const importCompanies = async (req: AuthRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req.user);
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer as any);
        const worksheet = workbook.getWorksheet(1);

        if (!worksheet) {
            return res.status(400).json({ success: false, message: 'No worksheet found' });
        }

        const results: any = {
            created: 0,
            updated: 0,
            errors: [] as string[],
            companies: [] as any[],
        };

        // Map column headers to indices
        const headerRow = worksheet.getRow(1);
        const headers: any = {};
        headerRow.eachCell((cell, col) => {
            const key = cell.value?.toString().toLowerCase().trim();
            if (key) headers[key] = col;
        });

        // Process each row
        for (let row = 2; row <= worksheet.rowCount; row++) {
            try {
                const getCell = (key: string) => {
                    const col = headers[key];
                    return col ? worksheet.getRow(row).getCell(col).value : null;
                };

                const name = getCell('company name') || getCell('name');
                if (!name) {
                    results.errors.push(`Row ${row}: Missing company name`);
                    continue;
                }

                // Find existing company by name within tenant
                let company = await Company.findOne({ name, tenantId });
                const isUpdate = !!company;

                const parentName = getCell('parent company') || getCell('parent');
                let parentCompanyId = null;
                if (parentName) {
                    const parent = await Company.findOne({ name: parentName, tenantId });
                    parentCompanyId = parent?._id || null;
                }

                const companyData = {
                    name,
                    tenantId,
                    parentCompanyId,
                    industry: getCell('industry') || undefined,
                    description: getCell('description') || undefined,
                    website: getCell('website') || undefined,
                    email: getCell('company email') || undefined,
                    phone: getCell('phone') || getCell('contact') || undefined,
                    phoneCountryCode: getCell('phone country code') || getCell('country code') || '+91',
                    address: {
                        street: getCell('street') || undefined,
                        city: getCell('city') || undefined,
                        state: getCell('state') || undefined,
                        country: getCell('country') || 'India',
                        postalCode: getCell('postal code') || getCell('postalcode') || undefined,
                    },
                    status: (getCell('status')?.toString().toLowerCase() === 'inactive' ? 'inactive' : 'active') as 'active' | 'inactive',
                };

                if (isUpdate) {
                    company = await Company.findOneAndUpdate({ _id: company!._id, tenantId }, companyData, { new: true });
                    results.updated++;
                } else {
                    company = await Company.create(companyData);
                    results.created++;
                }

                results.companies.push(company);

                // Import contacts if columns exist
                const contactName = getCell('contact name') || getCell('contact person');
                if (contactName && company) {
                    const contactEmail = getCell('contact email') || getCell('email') || undefined;
                    const isPrimaryRaw = getCell('is primary')?.toString().toLowerCase();
                    const isPrimary = isPrimaryRaw === 'true' || isPrimaryRaw === 'yes' || isPrimaryRaw === 'y' || isPrimaryRaw === '1';

                    const contactData = {
                        companyId: company._id,
                        tenantId,
                        name: contactName,
                        email: contactEmail,
                        phone: getCell('contact phone') || undefined,
                        position: getCell('position') || getCell('designation') || undefined,
                        department: getCell('department') || undefined,
                        isPrimary: isPrimary,
                        notes: getCell('notes') || undefined,
                    };

                    // Avoid duplicate contacts within the same company
                    const existingContact = await Contact.findOne({ 
                        companyId: company._id, 
                        tenantId,
                        $or: [
                            { name: contactName },
                            ...(contactEmail ? [{ email: contactEmail }] : [])
                        ]
                    });

                    if (existingContact) {
                        await Contact.findOneAndUpdate({ _id: existingContact._id, tenantId }, contactData);
                    } else {
                        await Contact.create(contactData);
                    }
                }
            } catch (error: any) {
                results.errors.push(`Row ${row}: ${error.message}`);
            }
        }

        await ActivityLog.create({
            action: 'Companies imported',
            user: req.user!._id,
            entityType: EntityType.COMPANY,
            entityId: req.user!._id,
            metadata: {
                createdCount: results.created,
                updatedCount: results.updated,
                fileName: req.file?.originalname
            },
        });

        res.json({ success: true, results });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Export Companies to Excel
export const exportCompaniesToExcel = async (req: Request, res: Response) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Companies');

        // Define columns
        worksheet.columns = [
            { header: 'Company Name', key: 'name', width: 30 },
            { header: 'Parent Company', key: 'parentCompany', width: 25 },
            { header: 'Industry', key: 'industry', width: 20 },
            { header: 'Description', key: 'description', width: 40 },
            { header: 'Website', key: 'website', width: 25 },
            { header: 'Email', key: 'email', width: 25 },
            { header: 'Phone Country Code', key: 'phoneCountryCode', width: 10 },
            { header: 'Phone', key: 'phone', width: 15 },
            { header: 'Street', key: 'street', width: 25 },
            { header: 'City', key: 'city', width: 15 },
            { header: 'State', key: 'state', width: 15 },
            { header: 'Country', key: 'country', width: 15 },
            { header: 'Postal Code', key: 'postalCode', width: 15 },
            { header: 'Status', key: 'status', width: 12 },
            { header: 'Contact Name', key: 'contactName', width: 25 },
            { header: 'Contact Email', key: 'contactEmail', width: 25 },
            { header: 'Contact Phone', key: 'contactPhone', width: 15 },
            { header: 'Position', key: 'position', width: 20 },
            { header: 'Department', key: 'department', width: 15 },
            { header: 'Is Primary', key: 'isPrimary', width: 12 },
        ];

        // Style header row
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' },
        };

        // Fetch companies with optional ID filtering within tenant
        const tenantId = getTenantId((req as any).user);
        const { ids } = req.query;
        let queryFilter: any = { tenantId };
        if (ids) {
            const idList = (ids as string).split(',');
            queryFilter._id = { $in: idList };
        }
        
        const companies = await Company.find(queryFilter).populate('contacts').lean();

        // Get parent company names map
        const parentIds = [...new Set(companies.map(c => c.parentCompanyId).filter(Boolean))];
        const parents = await Company.find({ _id: { $in: parentIds }, tenantId });
        const parentMap = new Map(parents.map(p => [p._id.toString(), p.name]));

        for (const company of companies) {
            const parentName = company.parentCompanyId ? parentMap.get(company.parentCompanyId.toString()) || '' : '';

            // Base company row
            const baseRow = {
                name: company.name,
                parentCompany: parentName,
                industry: company.industry || '',
                description: company.description || '',
                website: company.website || '',
                email: company.email || '',
                phoneCountryCode: company.phoneCountryCode || '+91',
                phone: company.phone || '',
                street: company.address?.street || '',
                city: company.address?.city || '',
                state: company.address?.state || '',
                country: company.address?.country || '',
                postalCode: company.address?.postalCode || '',
                status: company.status,
            };

            const contacts: any[] = (company as any).contacts || [];

            if (contacts.length === 0) {
                // No contacts - add company row only
                worksheet.addRow(baseRow);
            } else {
                // One row per contact
                contacts.forEach((contact, idx) => {
                    worksheet.addRow({
                        ...baseRow,
                        contactName: contact.name,
                        contactEmail: contact.email || '',
                        contactPhone: contact.phone || '',
                        position: contact.position || '',
                        department: contact.department || '',
                        isPrimary: contact.isPrimary ? 'Yes' : 'No',
                    });
                });
            }
        }

        // Set response headers
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename="companies_export_' + new Date().toISOString().split('T')[0] + '.xlsx"'
        );

        await workbook.xlsx.write(res);
        res.end();
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Export Companies to PDF
export const exportCompaniesToPDF = async (req: Request, res: Response) => {
    try {
        const doc = new PDFDocument({ margin: 40, size: 'A4' });

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            'attachment; filename="companies_export_' + new Date().toISOString().split('T')[0] + '.pdf"'
        );

        doc.pipe(res);

        // Title
        doc.fontSize(20).font('Helvetica-Bold').text('Companies Report', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica').text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
        doc.moveDown(1);

        // Fetch companies with optional ID filtering within tenant
        const tenantId = getTenantId((req as any).user);
        const { ids } = req.query;
        let queryFilter: any = { tenantId };
        if (ids) {
            const idList = (ids as string).split(',');
            queryFilter._id = { $in: idList };
        }
        
        const companies = await Company.find(queryFilter).sort({ name: 1 }).populate('contacts');

        // Get parent company names map
        const parentIds = [...new Set(companies.map(c => c.parentCompanyId).filter(Boolean))];
        const parents = await Company.find({ _id: { $in: parentIds }, tenantId });
        const parentMap = new Map(parents.map(p => [p._id.toString(), p.name]));

        for (let i = 0; i < companies.length; i++) {
            const company = companies[i];
            const parentName = company.parentCompanyId ? parentMap.get(company.parentCompanyId.toString()) || '' : '';

            // Company header
            doc.fontSize(14).font('Helvetica-Bold').text(company.name);

            if (parentName) {
                doc.fontSize(10).font('Helvetica-Oblique').text(`Subsidiary of: ${parentName}`);
            }

            doc.moveDown(0.3);

            // Company details
            doc.fontSize(10).font('Helvetica');
            if (company.industry) doc.text(`Industry: ${company.industry}`);
            if (company.phone) {
                const phoneDisplay = company.phoneCountryCode ? `${company.phoneCountryCode} ${company.phone}` : company.phone;
                doc.text(`Phone: ${phoneDisplay}`);
            }
            if (company.website) doc.text(`Website: ${company.website}`);
            if (company.description) doc.text(`Description: ${company.description}`, { width: 500 });

            if (company.address && (company.address.street || company.address.city || company.address.country)) {
                const addr = [
                    company.address.street,
                    company.address.city,
                    company.address.state,
                    company.address.postalCode,
                    company.address.country,
                ].filter(Boolean).join(', ');
                doc.text(`Address: ${addr}`);
            }

            doc.moveDown(0.3);
            doc.fontSize(10).font('Helvetica-Bold').text(`Status: ${company.status.toUpperCase()}`, { continued: true });

            // Contacts section
            const contacts: any[] = (company as any).contacts || [];
            if (contacts.length > 0) {
                doc.moveDown(0.5);
                doc.fontSize(11).font('Helvetica-Bold').text('Contacts:');
                doc.moveDown(0.3);

                doc.fontSize(10).font('Helvetica');
                contacts.forEach((contact, idx) => {
                    const primaryBadge = contact.isPrimary ? ' [PRIMARY]' : '';
                    let contactText = `  ${idx + 1}. ${contact.name}${primaryBadge}`;
                    if (contact.position) contactText += ` - ${contact.position}`;
                    if (contact.department) contactText += ` (${contact.department})`;
                    doc.text(contactText);

                    if (contact.email) doc.fontSize(9).font('Helvetica-Oblique').text(`     Email: ${contact.email}`);
                    if (contact.phone) doc.fontSize(9).font('Helvetica-Oblique').text(`     Phone: ${contact.phone}`);
                    if (contact.notes) doc.fontSize(9).font('Helvetica-Oblique').text(`     Notes: ${contact.notes}`);
                    doc.fontSize(10).font('Helvetica');

                    if (idx < contacts.length - 1) doc.moveDown(0.3);
                });
            }

            // Add line between companies
            if (i < companies.length - 1) {
                doc.moveDown(0.5);
                doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke('#CCCCCC');
                doc.moveDown(0.5);
            }

            // Add page break if needed
            if (doc.y > 750 && i < companies.length - 1) {
                doc.addPage();
            }
        }

        doc.end();
    } catch (error: any) {
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: error.message });
        }
    }
};

// Send Bulk Email to Companies
export const sendBulkCompanyEmail = async (req: AuthRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req.user);
        const { companyIds, subject, message } = req.body;

        if (!companyIds || !Array.isArray(companyIds) || companyIds.length === 0) {
            return res.status(400).json({ success: false, message: 'No companies selected' });
        }

        if (!subject || !message) {
            return res.status(400).json({ success: false, message: 'Subject and message are required' });
        }

        // Fetch company emails within tenant
        const companies = await Company.find({ _id: { $in: companyIds }, tenantId }).select('email name');
        const emails = companies.map(c => c.email).filter(Boolean) as string[];

        if (emails.length === 0) {
            return res.status(400).json({ success: false, message: 'None of the selected companies have an email address' });
        }

        await sendGenericEmail(emails, subject, message);

        await ActivityLog.create({
            action: 'Bulk email sent',
            user: req.user!._id,
            entityType: EntityType.COMPANY,
            entityId: req.user!._id,
            metadata: {
                targetCount: companyIds.length,
                successCount: emails.length,
                subject
            },
        });

        res.json({
            success: true,
            message: `Email sent successfully to ${emails.length} companies`,
            skipped: companyIds.length - emails.length
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Download Sample Excel Template
export const downloadSampleExcel = async (req: Request, res: Response) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Sample Format');

        // Define columns
        worksheet.columns = [
            { header: 'Company Name', key: 'name', width: 25 },
            { header: 'Parent Company', key: 'parent', width: 20 },
            { header: 'Industry', key: 'industry', width: 20 },
            { header: 'Description', key: 'description', width: 30 },
            { header: 'Website', key: 'website', width: 25 },
            { header: 'Company Email', key: 'email', width: 25 },
            { header: 'Phone Country Code', key: 'phoneCountryCode', width: 10 },
            { header: 'Phone', key: 'phone', width: 15 },
            { header: 'Street', key: 'street', width: 20 },
            { header: 'City', key: 'city', width: 15 },
            { header: 'State', key: 'state', width: 15 },
            { header: 'Country', key: 'country', width: 15 },
            { header: 'Postal Code', key: 'zip', width: 12 },
            { header: 'Status', key: 'status', width: 10 },
            { header: 'Contact Name', key: 'cname', width: 20 },
            { header: 'Contact Email', key: 'cemail', width: 25 },
            { header: 'Contact Phone', key: 'cphone', width: 15 },
            { header: 'Position', key: 'pos', width: 20 },
            { header: 'Department', key: 'dept', width: 15 },
            { header: 'Is Primary', key: 'pri', width: 12 },
            { header: 'Notes', key: 'notes', width: 30 },
        ];

        // Style header row
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' },
        };

        // Add sample data
        worksheet.addRow({
            name: 'Sample Corp',
            parent: '',
            industry: 'Technology',
            description: 'A sample technology company',
            website: 'https://example.com',
            email: 'contact@samplecorp.com',
            phoneCountryCode: '+91',
            phone: '1234567890',
            street: '123 Tech Park',
            city: 'Bangalore',
            state: 'Karnataka',
            country: 'India',
            zip: '560001',
            status: 'Active',
            cname: 'John Doe',
            cemail: 'john@example.com',
            cphone: '9876543210',
            pos: 'Managing Director',
            dept: 'Management',
            pri: 'Yes',
            notes: 'First contact for this company',
        });

        worksheet.addRow({
            name: 'Sample Corp',
            cname: 'Jane Smith',
            cemail: 'jane@example.com',
            cphone: '9876543211',
            pos: 'Technical Lead',
            dept: 'Engineering',
            pri: 'No',
            notes: 'Second contact for the same company',
        });

        // Set response headers
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename="company_import_sample.xlsx"'
        );

        await workbook.xlsx.write(res);
        res.end();
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export { upload };
