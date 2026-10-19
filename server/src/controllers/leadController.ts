import { Response } from "express";
import mongoose from "mongoose";
import Lead from "../models/Lead";
import Database from "../models/Database";
import Partner from "../models/Partner";
import LoanProduct from "../models/LoanProduct";
import ActivityLog, { EntityType } from "../models/ActivityLog";
import CaseFile from "../models/CaseFile";
import { AuthRequest } from "../middlewares/auth";
import XLSX from "xlsx";
import { emitLeadCreated, emitLeadUpdated, emitLeadDeleted, emitCaseFileDeleted } from "../services/crmSocketService";
import { ensureCaseFileForLead, syncCaseFileForLeadStatus } from "../services/caseFileService";

const getAccessibleDatabaseIds = async (user: any, tenantId: string) => {
    if (user.role === 'admin' || user.role === 'manager') return null;
    return Database.find({ tenantId, $or: [{ people: user._id }, { createdBy: user._id }] }).distinct('_id');
};

const getTenantId = (user: any): string =>
	(user.tenantId?._id || user.tenantId).toString();

// ── Excel import helpers ──────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LEAD_PRIORITIES = ["very high", "high", "medium", "low"];
const LEAD_STATUSES = [
	"new",
	"attempted",
	"connected",
	"interested",
	"callback_scheduled",
	"meeting_scheduled",
	"not_interested",
	"not_reachable",
	"do_not_call",
	"closed_won",
	"closed_lost",
];

const pickStr = (row: any, ...keys: string[]): string => {
	for (const k of keys) {
		const v = row[k];
		if (v !== undefined && v !== null && String(v).trim() !== "")
			return String(v).trim();
	}
	return "";
};

const escapeRegExp = (s: string): string =>
	s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const panFromGstStr = (gst: string): string => {
	const g = gst.trim().toUpperCase();
	if (g.length !== 15) return "";
	const pan = g.slice(2, 12);
	return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan) ? pan : "";
};

// Resolve the product a partner gave a lead for against the LoanProduct
// catalog (case-insensitive exact name match). The text is always stored on
// the lead; the id is filled in when it matches a catalog entry.
const matchLeadProduct = async (
	tenantId: any,
	nameRaw: any,
	cache?: Map<string, any>,
): Promise<{ product: string; productId: any }> => {
	const product = String(nameRaw || "").trim();
	if (!product) return { product: "", productId: undefined };
	const key = product.toLowerCase();
	if (cache && cache.has(key)) return { product, productId: cache.get(key) };
	const rx = new RegExp(`^${escapeRegExp(product)}$`, "i");
	const found = await LoanProduct.findOne({ tenantId, name: rx })
		.select("_id")
		.lean();
	const productId = found ? (found as any)._id : undefined;
	if (cache) cache.set(key, productId);
	return { product, productId };
};

export const getLeads = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		const tenantId = getTenantId(req.user);
		const { databaseId, partnerId, status, search, industry, source, priority, city, state, pincode } =
			req.query;
		const page = Math.max(1, parseInt(req.query.page as string) || 1);
		const limit = Math.max(
			1,
			parseInt(req.query.limit as string) || 100000,
		);
		const skip = (page - 1) * limit;

		const filter: any = { tenantId };
		let databaseOr: any[] | null = null;
		let searchOr: any[] | null = null;

		if (databaseId === '__none__') {
			const allDatabaseIds = await Database.find({ tenantId }).distinct('_id');
			filter.databaseId = { $nin: allDatabaseIds };
		} else {
			if (databaseId) filter.databaseId = databaseId;

			const accessible = await getAccessibleDatabaseIds(req.user, tenantId);
			if (accessible) {
				if (databaseId) {
					const hasAccess = accessible.some((id: any) => id.toString() === databaseId);
					if (!hasAccess) {
						res.json({ success: true, leads: [], total: 0, page, limit, totalPages: 0 });
						return;
					}
				} else {
					const allDatabaseIds = await Database.find({ tenantId }).distinct('_id');
					databaseOr = [
						{ databaseId: { $in: accessible } },
						{ databaseId: { $nin: allDatabaseIds } },
					];
				}
			}
		}

		if (status) {
			const statuses = String(status).split(",").map(s => s.trim()).filter(Boolean);
			if (statuses.length === 1) {
				filter.status = statuses[0];
			} else if (statuses.length > 1) {
				filter.status = { $in: statuses };
			}
		}
		if (industry) filter.industry = industry;
		if (source) filter.source = source;
		if (partnerId) filter.partnerId = partnerId;
		if (priority) filter.priority = priority;
		if (city) filter.city = city;
		if (state) filter.state = state;
		if (pincode) filter.pincode = pincode;
		if (search) {
			const q = String(search).trim();
			const digits = q.replace(/\D/g, '');
			const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			searchOr = [
				{ name: { $regex: escaped, $options: 'i' } },
				{ companyName: { $regex: escaped, $options: 'i' } },
				{ email: { $regex: escaped, $options: 'i' } },
				{ designation: { $regex: escaped, $options: 'i' } },
				{ companyPan: { $regex: escaped, $options: 'i' } },
				{ companyGst: { $regex: escaped, $options: 'i' } },
				{ addressLine: { $regex: escaped, $options: 'i' } },
				{ city: { $regex: escaped, $options: 'i' } },
				{ state: { $regex: escaped, $options: 'i' } },
				{ pincode: { $regex: escaped, $options: 'i' } },
			];
			if (digits.length >= 3) {
				searchOr.push({ phone: { $regex: digits, $options: 'i' } });
				searchOr.push({ alternatePhone: { $regex: digits, $options: 'i' } });
			}
		}

		if (databaseOr && searchOr) {
			filter.$and = [{ $or: databaseOr }, { $or: searchOr }];
		} else if (databaseOr) {
			filter.$or = databaseOr;
		} else if (searchOr) {
			filter.$or = searchOr;
		}

		const [leads, total] = await Promise.all([
			Lead.find(filter)
				.populate("databaseId", "name")
				.populate("partnerId", "companyName personName partnerType")
				.populate("notes.createdBy", "name email avatar")
				.sort({ createdAt: -1 })
				.skip(skip)
				.limit(limit),
			Lead.countDocuments(filter),
		]);

		res.json({
			success: true,
			leads,
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		});
	} catch (error: any) {
		res.status(500).json({ success: false, message: error.message });
	}
};

export const getLead = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		const lead = await Lead.findById(req.params.id)
			.populate("databaseId", "name")
			.populate("partnerId", "companyName personName partnerType")
			.populate("notes.createdBy", "name email avatar");

		if (!lead) {
			res.status(404).json({ success: false, message: "Lead not found" });
			return;
		}

		const accessible = await getAccessibleDatabaseIds(req.user, lead.tenantId.toString());
		if (accessible) {
			const hasAccess = accessible.some((id: any) => id.toString() === lead.databaseId._id?.toString() || id.toString() === lead.databaseId.toString());
			if (!hasAccess) {
				res.status(404).json({ success: false, message: "Lead not found" });
				return;
			}
		}

		res.json({ success: true, lead });
	} catch (error: any) {
		res.status(500).json({ success: false, message: error.message });
	}
};

export const createLead = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		const tenantId = getTenantId(req.user);

		// Source attribution: udyam (default) | self (logged-in user) | partner (selected partner)
		const sourceType = (req.body.sourceType || 'udyam') as 'udyam' | 'self' | 'partner';
		let source = 'Udyam Capital';
		let partnerId: any = undefined;
		if (sourceType === 'self') {
			source = req.user!.name;
		} else if (sourceType === 'partner') {
			if (!req.body.partnerId) {
				res.status(400).json({ success: false, message: 'partnerId is required when source is partner' });
				return;
			}
			const partner = await Partner.findOne({ _id: req.body.partnerId, tenantId });
			if (!partner) {
				res.status(400).json({ success: false, message: 'Partner not found' });
				return;
			}
			partnerId = partner._id;
			source = (partner as any).companyName || (partner as any).name || (partner as any).personName || 'Partner';
		} else if (req.body.source && !req.body.sourceType) {
			// Backward compat: explicit source (e.g. field_visit imports)
			source = String(req.body.source);
		}

		// Product the partner gave this lead for (matched against the catalog)
		const matchedProduct = await matchLeadProduct(tenantId, req.body.product);

		if (!req.body.databaseId) delete req.body.databaseId;
		if (!req.body.partnerId) delete req.body.partnerId;
		// Auto-derive company PAN from GSTIN (chars 3–12) when PAN not given
		if (!req.body.companyPan && req.body.companyGst) {
			const g = String(req.body.companyGst).trim().toUpperCase();
			if (g.length === 15) {
				const derived = g.slice(2, 12);
				if (/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(derived)) req.body.companyPan = derived;
			}
		}
		const lead = await Lead.create({
			...req.body,
			tenantId,
			source,
			sourceType,
			...(partnerId ? { partnerId } : { partnerId: undefined }),
			product: matchedProduct.product || undefined,
			productId: matchedProduct.productId,
			status: sourceType === "partner" ? "closed_won" : "new",
			callCount: 0,
			followUpCount: 0,
			meetingCount: 0,
			followUpLogs: [],
			meetingLogs: [],
			notes: [],
		});

		const populated = await Lead.findById(lead._id).populate(
			"databaseId",
			"name",
		).populate("partnerId", "companyName personName partnerType");

		await ActivityLog.create({
			action: "Lead created",
			user: req.user!._id,
			entityType: EntityType.LEAD,
			entityId: lead._id,
			metadata: { name: lead.name },
		});

		emitLeadCreated(tenantId, populated);

		// Partner leads are won deals from the start — track them in CaseFiles.
		if (lead.status === "closed_won") {
			try {
				await ensureCaseFileForLead(lead, req.user!);
			} catch (caseFileErr) {
				console.error("ensureCaseFileForLead failed:", caseFileErr);
			}
		}

		res.status(201).json({ success: true, lead: populated });
	} catch (error: any) {
		res.status(400).json({ success: false, message: error.message });
	}
};

// Quick-add batch endpoint: creates many leads in one request so a partner's
// 50+ leads can be added almost instantly (one round-trip + one insertMany).
export const bulkCreateLeads = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		const tenantId = getTenantId(req.user);
		const rows = Array.isArray(req.body.leads) ? req.body.leads : null;
		if (!rows || rows.length === 0) {
			res.status(400).json({ success: false, message: "leads array is required" });
			return;
		}
		if (rows.length > 500) {
			res.status(400).json({ success: false, message: "Too many leads in one batch (max 500)" });
			return;
		}

		// Source attribution mirrors createLead: udyam (default) | self | partner
		const sourceType = (req.body.sourceType || "udyam") as "udyam" | "self" | "partner";
		let source = "Udyam Capital";
		let partnerId: any = undefined;
		if (sourceType === "self") {
			source = req.user!.name;
		} else if (sourceType === "partner") {
			if (!req.body.partnerId) {
				res.status(400).json({ success: false, message: "partnerId is required when source is partner" });
				return;
			}
			const partner = await Partner.findOne({ _id: req.body.partnerId, tenantId });
			if (!partner) {
				res.status(400).json({ success: false, message: "Partner not found" });
				return;
			}
			partnerId = partner._id;
			source = (partner as any).companyName || (partner as any).name || (partner as any).personName || "Partner";
		}

		// Product the partner gave the leads for, stored on every row
		const matchedProduct = await matchLeadProduct(tenantId, req.body.product);

		// Duplicate phone detection — against the tenant's existing leads and
		// within the submitted batch (same rules as the Excel import).
		const phones = rows
			.map((row: any) => String(row?.phone || "").replace(/\D/g, ""))
			.filter((p: string) => p.length === 10);
		const existing = phones.length
			? await Lead.find({ tenantId, phone: { $in: phones } }).select("phone").lean()
			: [];
		const existingPhones = new Set(existing.map((l: any) => l.phone));
		const seenPhones = new Set<string>();

		const docs: any[] = [];
		const errors: { row: number; message: string }[] = [];

		rows.forEach((row: any, idx: number) => {
			const rowNo = idx + 1;
			const name = String(row?.name || "").trim();
			if (!name) {
				errors.push({ row: rowNo, message: "Missing name (required)" });
				return;
			}
			const rawPhone = String(row?.phone ?? "").trim();
			const phone = rawPhone.replace(/\D/g, "");
			if (rawPhone && phone.length !== 10) {
				errors.push({ row: rowNo, message: `Invalid phone "${rawPhone}" (must be 10 digits)` });
				return;
			}
			if (phone && (existingPhones.has(phone) || seenPhones.has(phone))) {
				errors.push({ row: rowNo, message: `Duplicate phone: ${phone}` });
				return;
			}
			if (phone) seenPhones.add(phone);

			docs.push({
				tenantId,
				name,
				phone: phone || undefined,
				companyName: String(row?.companyName || "").trim() || undefined,
				source,
				sourceType,
				...(partnerId ? { partnerId } : { partnerId: undefined }),
				product: matchedProduct.product || undefined,
				productId: matchedProduct.productId,
				status: sourceType === "partner" ? "closed_won" : "new",
				callCount: 0,
				followUpCount: 0,
				meetingCount: 0,
				followUpLogs: [],
				meetingLogs: [],
				notes: [],
			});
		});

		const created = docs.length ? await Lead.insertMany(docs) : [];

		if (created.length > 0) emitLeadCreated(tenantId, created[0]);

		// Partner batches are won deals from the start — track each in CaseFiles.
		if (sourceType === "partner" && created.length > 0) {
			for (const lead of created) {
				try {
					await ensureCaseFileForLead(lead, req.user!);
				} catch (caseFileErr) {
					console.error("ensureCaseFileForLead failed:", caseFileErr);
				}
			}
		}

		await ActivityLog.create({
			action: `${created.length} leads added`,
			user: req.user!._id,
			entityType: EntityType.LEAD,
			entityId: created[0]?._id || req.user!._id,
			metadata: { count: created.length, errors: errors.length },
		});

		res.status(201).json({
			success: true,
			total: rows.length,
			imported: created.length,
			errors,
		});
	} catch (error: any) {
		res.status(500).json({ success: false, message: error.message });
	}
};

export const updateLead = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		const lead = await Lead.findById(req.params.id);

		if (!lead) {
			res.status(404).json({ success: false, message: "Lead not found" });
			return;
		}

		const oldStatus = lead.status;

		const protectedFields = ['tenantId', 'createdBy', 'notes', 'followUpLogs', 'meetingLogs', 'callCount', 'followUpCount', 'meetingCount', 'callDuration', 'lastCallAt', 'source', '_id'];
		const sanitizedBody = { ...req.body };
		for (const field of protectedFields) {
			delete sanitizedBody[field];
		}
		if (sanitizedBody.databaseId === '') sanitizedBody.databaseId = null;
		if (sanitizedBody.partnerId === '') sanitizedBody.partnerId = null;
		if (sanitizedBody.databaseId) {
			const target = await Database.findOne({ _id: sanitizedBody.databaseId, tenantId: lead.tenantId });
			if (!target) {
				res.status(400).json({ success: false, message: 'Database not found' });
				return;
			}
		}
		// Source reassignment via sourceType/partnerId (direct `source` stays server-computed)
		if (sanitizedBody.sourceType || sanitizedBody.partnerId !== undefined) {
			const nextType = sanitizedBody.sourceType || (lead as any).sourceType || 'udyam';
			if (!['udyam', 'self', 'partner'].includes(nextType)) {
				res.status(400).json({ success: false, message: 'Invalid sourceType' });
				return;
			}
			if (nextType === 'partner') {
				const pid = sanitizedBody.partnerId !== undefined ? sanitizedBody.partnerId : (lead as any).partnerId;
				if (!pid) {
					res.status(400).json({ success: false, message: 'partnerId is required when source is partner' });
					return;
				}
				const partner = await Partner.findOne({ _id: pid, tenantId: lead.tenantId });
				if (!partner) {
					res.status(400).json({ success: false, message: 'Partner not found' });
					return;
				}
				sanitizedBody.partnerId = partner._id;
				(lead as any).source = (partner as any).companyName || (partner as any).name || (partner as any).personName || 'Partner';
			} else {
				sanitizedBody.partnerId = null;
				(lead as any).source = nextType === 'self' ? req.user!.name : 'Udyam Capital';
			}
			sanitizedBody.sourceType = nextType;
		}
		Object.assign(lead, sanitizedBody);

		const body = req.body;
		if (body.scheduleType === 'follow_up' || body.nextFollowupAt) {
			lead.followUpCount = (lead.followUpCount || 0) + 1;
			lead.followUpLogs.push({
				scheduledAt: body.nextFollowupAt || lead.nextFollowupAt,
				createdAt: new Date(),
			});
		}
		if (body.scheduleType === 'meeting' || body.meetingAt) {
			lead.meetingCount = (lead.meetingCount || 0) + 1;
			lead.meetingLogs.push({
				scheduledAt: body.meetingAt || lead.meetingAt,
				createdAt: new Date(),
				status: 'scheduled',
				mode: lead.meetingMode,
				location: lead.meetingLocation,
				link: lead.meetingLink,
			});
		}

		await lead.save();

		const populated = await Lead.findById(lead._id)
			.populate("databaseId", "name")
			.populate("partnerId", "companyName personName partnerType")
			.populate("notes.createdBy", "name email avatar");

		const changedFields = Object.keys(req.body);
		if (changedFields.includes("status") && oldStatus !== lead.status) {
			await ActivityLog.create({
				action: `Lead status changed: ${oldStatus.replace(/_/g, " ")} → ${lead.status.replace(/_/g, " ")}`,
				user: req.user!._id,
				entityType: EntityType.LEAD,
				entityId: lead._id,
				metadata: {
					name: lead.name,
					oldStatus,
					newStatus: lead.status,
					phone: lead.phone,
					company: lead.companyName,
				},
			});
		} else {
			await ActivityLog.create({
				action: "Lead updated",
				user: req.user!._id,
				entityType: EntityType.LEAD,
				entityId: lead._id,
				metadata: {
					name: lead.name,
					fields: changedFields,
					phone: lead.phone,
					company: lead.companyName,
				},
			});
		}

		// Follow-ups and meetings get their own log entry so the monthly
		// report can tell scheduling apart from ordinary lead edits.
		const meetingScheduled =
			body.scheduleType === 'meeting' || !!body.meetingAt;
		const followUpScheduled =
			body.scheduleType === 'follow_up' || !!body.nextFollowupAt;
		if (meetingScheduled || followUpScheduled) {
			const scheduledAt = meetingScheduled
				? body.meetingAt || lead.meetingAt
				: body.nextFollowupAt || lead.nextFollowupAt;
			await ActivityLog.create({
				action: meetingScheduled
					? `Meeting scheduled${lead.meetingMode ? ` (${lead.meetingMode})` : ''}`
					: 'Follow-up scheduled',
				user: req.user!._id,
				entityType: EntityType.LEAD,
				entityId: lead._id,
				metadata: {
					name: lead.name,
					phone: lead.phone,
					company: lead.companyName,
					scheduleType: meetingScheduled ? 'meeting' : 'follow_up',
					scheduledAt,
					meetingMode: lead.meetingMode,
					meetingLocation: lead.meetingLocation,
					meetingLink: lead.meetingLink,
				},
			});
		}

		const tId = getTenantId(req.user);
		emitLeadUpdated(tId, populated);

		// A lead that reaches closed_won from any path gets tracked in CaseFiles.
		if (oldStatus !== "closed_won" && lead.status === "closed_won") {
			await ensureCaseFileForLead(lead, req.user!);
		}
		// Lost / reopened leads keep their caseFile tracker in sync.
		if (oldStatus !== lead.status) {
			await syncCaseFileForLeadStatus(lead, oldStatus, req.user!);
		}

		res.json({ success: true, lead: populated });
	} catch (error: any) {
		res.status(400).json({ success: false, message: error.message });
	}
};

export const addNote = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		const { text } = req.body;

		if (!text || !text.trim()) {
			res.status(400).json({
				success: false,
				message: "Note text is required",
			});
			return;
		}

		const lead = await Lead.findById(req.params.id);

		if (!lead) {
			res.status(404).json({ success: false, message: "Lead not found" });
			return;
		}

		lead.notes.push({
			text: text.trim(),
			createdBy: req.user!._id,
			createdAt: new Date(),
		} as any);

		await lead.save();

		const populated = await Lead.findById(lead._id).populate(
			"notes.createdBy",
			"name email avatar",
		);

		await ActivityLog.create({
			action: "Note added to lead",
			user: req.user!._id,
			entityType: EntityType.LEAD,
			entityId: lead._id,
			metadata: {
				name: lead.name,
				notePreview:
					text.trim().slice(0, 80) +
					(text.trim().length > 80 ? "..." : ""),
				phone: lead.phone,
				company: lead.companyName,
			},
		});

		const tenantId = getTenantId(req.user);
		emitLeadUpdated(tenantId, populated);

		res.json({ success: true, lead: populated });
	} catch (error: any) {
		res.status(400).json({ success: false, message: error.message });
	}
};

export const updateNote = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		const { text } = req.body;

		if (!text || !text.trim()) {
			res.status(400).json({
				success: false,
				message: "Note text is required",
			});
			return;
		}

		const lead = await Lead.findById(req.params.id);

		if (!lead) {
			res.status(404).json({ success: false, message: "Lead not found" });
			return;
		}

		const note = (lead.notes as any).id(req.params.noteId);

		if (!note) {
			res.status(404).json({ success: false, message: "Note not found" });
			return;
		}

		const isOwner =
			note.createdBy?.toString() === req.user!._id.toString();

		if (!isOwner) {
			res.status(403).json({
				success: false,
				message: "You can only edit your own notes",
			});
			return;
		}

		note.text = text.trim();
		await lead.save();

		const populated = await Lead.findById(lead._id)
			.populate("databaseId", "name")
			.populate("notes.createdBy", "name email avatar");

		await ActivityLog.create({
			action: "Note edited on lead",
			user: req.user!._id,
			entityType: EntityType.LEAD,
			entityId: lead._id,
			metadata: {
				name: lead.name,
				notePreview:
					text.trim().slice(0, 80) +
					(text.trim().length > 80 ? "..." : ""),
				phone: lead.phone,
				company: lead.companyName,
			},
		});

		const tenantId = getTenantId(req.user);
		emitLeadUpdated(tenantId, populated);

		res.json({ success: true, lead: populated });
	} catch (error: any) {
		res.status(400).json({ success: false, message: error.message });
	}
};

export const deleteNote = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		const lead = await Lead.findById(req.params.id);

		if (!lead) {
			res.status(404).json({ success: false, message: "Lead not found" });
			return;
		}

		const note = (lead.notes as any).id(req.params.noteId);

		if (!note) {
			res.status(404).json({ success: false, message: "Note not found" });
			return;
		}

		const isOwner =
			note.createdBy?.toString() === req.user!._id.toString();

		if (!isOwner) {
			res.status(403).json({
				success: false,
				message: "You can only delete your own notes",
			});
			return;
		}

		note.deleteOne();
		await lead.save();

		const populated = await Lead.findById(lead._id)
			.populate("databaseId", "name")
			.populate("notes.createdBy", "name email avatar");

		await ActivityLog.create({
			action: "Note deleted from lead",
			user: req.user!._id,
			entityType: EntityType.LEAD,
			entityId: lead._id,
			metadata: {
				name: lead.name,
				phone: lead.phone,
				company: lead.companyName,
			},
		});

		const tenantId = getTenantId(req.user);
		emitLeadUpdated(tenantId, populated);

		res.json({ success: true, lead: populated });
	} catch (error: any) {
		res.status(400).json({ success: false, message: error.message });
	}
};

export const recordCall = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		const lead = await Lead.findById(req.params.id);

		if (!lead) {
			res.status(404).json({ success: false, message: "Lead not found" });
			return;
		}

		lead.callCount = (lead.callCount || 0) + 1;
		lead.lastCallAt = new Date();
		if (req.body.callDuration != null) {
			lead.callDuration =
				(lead.callDuration || 0) + Number(req.body.callDuration);
		}

		let statusChanged = false;
		let oldStatus = lead.status;
		if (req.body.status) {
			lead.status = req.body.status;
			statusChanged = oldStatus !== lead.status;
		}

		await lead.save();

		const populated = await Lead.findById(lead._id)
			.populate("databaseId", "name")
			.populate("notes.createdBy", "name email avatar");

		let action = `Call #${lead.callCount} recorded`;
		if (statusChanged) {
			action += ` — status: ${oldStatus.replace(/_/g, " ")} → ${lead.status.replace(/_/g, " ")}`;
		}

		await ActivityLog.create({
			action,
			user: req.user!._id,
			entityType: EntityType.LEAD,
			entityId: lead._id,
			metadata: {
				name: lead.name,
				callCount: lead.callCount,
				oldStatus,
				newStatus: lead.status,
				phone: lead.phone,
				company: lead.companyName,
			},
		});

		const tenantId = getTenantId(req.user);
		emitLeadUpdated(tenantId, populated);

		if (statusChanged && lead.status === "closed_won") {
			await ensureCaseFileForLead(lead, req.user!);
		}
		if (statusChanged) {
			await syncCaseFileForLeadStatus(lead, oldStatus, req.user!);
		}

		res.json({ success: true, lead: populated });
	} catch (error: any) {
		res.status(400).json({ success: false, message: error.message });
	}
};

export const deleteLead = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		const lead = await Lead.findByIdAndDelete(req.params.id);

		if (!lead) {
			res.status(404).json({ success: false, message: "Lead not found" });
			return;
		}

		const tenantId = getTenantId(req.user);
		emitLeadDeleted(tenantId, lead._id.toString());

		// CaseFiles are derived from their lead — remove them alongside it.
		const linkedCaseFiles = await CaseFile.find({
			tenantId: lead.tenantId,
			leadId: lead._id,
		}).select("_id");
		if (linkedCaseFiles.length) {
			await CaseFile.deleteMany({
				_id: { $in: linkedCaseFiles.map((c) => c._id) },
			});
			linkedCaseFiles.forEach((c) =>
				emitCaseFileDeleted(tenantId, c._id.toString()),
			);
		}

		await ActivityLog.create({
			action: "Lead deleted",
			user: req.user!._id,
			entityType: EntityType.LEAD,
			entityId: lead._id,
			metadata: {
				name: lead.name,
				phone: lead.phone,
				company: lead.companyName,
				status: lead.status,
			},
		});

		res.json({ success: true, message: "Lead deleted successfully" });
	} catch (error: any) {
		res.status(500).json({ success: false, message: error.message });
	}
};

export const importExcel = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		if (!req.file) {
			res.status(400).json({
				success: false,
				message: "No file uploaded",
			});
			return;
		}

		const tenantId = getTenantId(req.user);
		const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
		const sheetName = workbook.SheetNames[0];
		const sheet = workbook.Sheets[sheetName];
		// Partner templates carry a title block above the headers: locate the
		// row that actually holds the column headers (first row with a "name"
		// cell). Files with headers in row 1 keep working unchanged.
		const probe: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
		let headerRow = 0;
		for (let i = 0; i < Math.min(probe.length, 10); i++) {
			const cells = probe[i] || [];
			if (
				cells.some(
					(cell: any) =>
						String(cell ?? "").trim().toLowerCase() === "name",
				)
			) {
				headerRow = i;
				break;
			}
		}
		const rows: any[] = XLSX.utils.sheet_to_json(sheet, {
			range: headerRow,
		});
		const databaseId = req.body.databaseId;
		const bodyProduct = String(req.body.product || "").trim();

		// Partner-profile import: when partnerId is supplied, every row is
		// attributed to that partner (overrides row-level source columns).
		let forcedPartner: any = null;
		if (req.body.partnerId) {
			forcedPartner = await Partner.findOne({ _id: req.body.partnerId, tenantId });
			if (!forcedPartner) {
				res.status(400).json({ success: false, message: "Partner not found" });
				return;
			}
		}

		if (rows.length === 0) {
			res.status(400).json({
				success: false,
				message: "Excel file is empty",
			});
			return;
		}

		if (rows.length > 2000) {
			res.status(400).json({
				success: false,
				message: "Excel file has too many rows (max 2000 per import)",
			});
			return;
		}

		const leads = [];
		const errors = [];

		// Collect all phones and GSTs from rows for duplicate detection
		const rowPhones = rows.map((row, idx) => {
			const phone = String(row.phone || row.Phone || row.PHONE || "").trim();
			return { idx, phone };
		}).filter(r => r.phone);

		const rowGsts = rows.map((row, idx) => {
			const gst = String(row.companyGst || row["Company GST"] || row.company_gst || row.GST || row.gst || "").trim().toUpperCase();
			return { idx, gst };
		}).filter(r => r.gst);

		// Find existing leads with matching phones or GSTs in this tenant
		const [existingPhones, existingGsts] = await Promise.all([
			rowPhones.length > 0
				? Lead.find({ tenantId, phone: { $in: rowPhones.map(r => r.phone) } }).select("phone").lean()
				: [],
			rowGsts.length > 0
				? Lead.find({ tenantId, companyGst: { $in: rowGsts.map(r => r.gst) } }).select("companyGst").lean()
				: [],
		]);
		const existingPhoneSet = new Set(existingPhones.map((l: any) => l.phone));
		const existingGstSet = new Set(existingGsts.map((l: any) => l.companyGst));
		const seenPhones = new Set<string>();
		const seenGsts = new Set<string>();

		// Partner lookup cache for sourceType=partner rows
		const partnerCache = new Map<string, any>();
		const resolvePartner = async (key: string): Promise<any> => {
			const k = key.trim().toLowerCase();
			if (partnerCache.has(k)) return partnerCache.get(k);
			const rx = new RegExp(`^${escapeRegExp(key.trim())}$`, "i");
			const p = await Partner.findOne({
				tenantId,
				$or: [{ companyName: rx }, { personName: rx }, { name: rx }],
			});
			partnerCache.set(k, p || null);
			return p || null;
		};

		// Product resolution cache for partner rows (one lookup per name)
		const productCache = new Map<string, any>();

		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			const rowNo = i + 1;
			try {
				const name = pickStr(row, "name", "Name", "NAME");
				if (!name) {
					errors.push({ row: rowNo, message: "Missing name (required)" });
					continue;
				}

				// Phone → digits, must be 10 when present
				const rawPhone = pickStr(row, "phone", "Phone", "PHONE");
				const phone = rawPhone ? rawPhone.replace(/\D/g, "") : "";
				if (rawPhone && phone.length !== 10) {
					errors.push({ row: rowNo, message: `Invalid phone "${rawPhone}" (must be 10 digits)` });
					continue;
				}
				if (phone && (existingPhoneSet.has(phone) || seenPhones.has(phone))) {
					errors.push({ row: rowNo, message: `Duplicate phone: ${phone}` });
					continue;
				}

				const rawAlt = pickStr(row, "alternatePhone", "Alternate Phone", "alternate_phone");
				const alternatePhone = rawAlt ? rawAlt.replace(/\D/g, "") : "";
				if (rawAlt && alternatePhone.length !== 10) {
					errors.push({ row: rowNo, message: `Invalid alternate phone "${rawAlt}" (must be 10 digits)` });
					continue;
				}

				const emailRaw = pickStr(row, "email", "Email", "EMAIL");
				const email = emailRaw ? emailRaw.toLowerCase() : undefined;
				if (email && !EMAIL_RE.test(email)) {
					errors.push({ row: rowNo, message: `Invalid email "${emailRaw}"` });
					continue;
				}

				const gst = pickStr(row, "companyGst", "Company GST", "company_gst", "GST", "gst").toUpperCase();
				if (gst && gst.length !== 15) {
					errors.push({ row: rowNo, message: `Invalid GST "${gst}" (must be 15 characters)` });
					continue;
				}
				if (gst && (existingGstSet.has(gst) || seenGsts.has(gst))) {
					errors.push({ row: rowNo, message: `Duplicate GST: ${gst}` });
					continue;
				}

				// PAN auto-derived from GSTIN (chars 3–12) when not given
				let rowPan = pickStr(row, "companyPan", "Company PAN", "company_pan").toUpperCase();
				if (!rowPan && gst) rowPan = panFromGstStr(gst);

				const pincode = pickStr(row, "pincode", "Pincode", "PINCODE").replace(/\D/g, "");
				if (pincode && pincode.length !== 6) {
					errors.push({ row: rowNo, message: `Invalid pincode "${pincode}" (must be 6 digits)` });
					continue;
				}

				const priority = pickStr(row, "priority", "Priority", "PRIORITY").toLowerCase().replace(/_/g, " ") || "medium";
				if (!LEAD_PRIORITIES.includes(priority)) {
					errors.push({ row: rowNo, message: `Invalid priority (allowed: ${LEAD_PRIORITIES.join(", ")})` });
					continue;
				}

				const status = pickStr(row, "status", "Status", "STATUS").toLowerCase().replace(/[\s-]+/g, "_") || "new";
				if (!LEAD_STATUSES.includes(status)) {
					errors.push({ row: rowNo, message: `Invalid status (allowed: ${LEAD_STATUSES.join(", ")})` });
					continue;
				}

				// Source attribution: sourceType column wins, else legacy source label, else Udyam Capital
				const typeRaw = pickStr(row, "sourceType", "Source Type", "source_type").toLowerCase();
				const legacySource = pickStr(row, "source", "Source", "SOURCE");
				let sourceType: "udyam" | "self" | "partner" = "udyam";
				let source = "Udyam Capital";
				let rowPartnerId: any = undefined;
				if (forcedPartner) {
					// Partner-profile import: attach the whole file to this partner
					sourceType = "partner";
					rowPartnerId = forcedPartner._id;
					source = forcedPartner.companyName || forcedPartner.name || forcedPartner.personName || "Partner";
				} else if (typeRaw.startsWith("part")) {
					const partnerKey = pickStr(row, "partner", "Partner", "PARTNER", "partnerName", "Partner Name", "referredBy", "Referred By");
					if (!partnerKey) {
						errors.push({ row: rowNo, message: 'sourceType is "partner" but no partner given (use the "partner" column)' });
						continue;
					}
					const p = await resolvePartner(partnerKey);
					if (!p) {
						errors.push({ row: rowNo, message: `Partner not found: "${partnerKey}"` });
						continue;
					}
					sourceType = "partner";
					rowPartnerId = p._id;
					source = p.companyName || p.name || p.personName || "Partner";
				} else if (typeRaw === "self" || (typeRaw && typeRaw === req.user!.name.toLowerCase())) {
					sourceType = "self";
					source = req.user!.name;
				} else if (legacySource) {
					source = legacySource;
				}

				// Product the partner gave this lead for (row value wins over
				// the upload-form default)
				const matchedProduct = await matchLeadProduct(
					tenantId,
					pickStr(row, "product", "Product", "PRODUCT") || bodyProduct,
					productCache,
				);

				const lead = await Lead.create({
					databaseId,
					tenantId,
					name,
					designation: pickStr(row, "designation", "Designation"),
					phone: phone || undefined,
					alternatePhone: alternatePhone || undefined,
					companyName: pickStr(row, "companyName", "Company", "Company Name", "company_name"),
					addressLine: pickStr(row, "addressLine", "Address Line", "address_line"),
					city: pickStr(row, "city", "City"),
					state: pickStr(row, "state", "State"),
					pincode: pincode || undefined,
					companyPan: rowPan,
					companyGst: gst,
					industry: pickStr(row, "industry", "Industry"),
					email,
					website: pickStr(row, "website", "Website"),
					priority,
					source,
					sourceType,
					...(rowPartnerId ? { partnerId: rowPartnerId } : {}),
					product: matchedProduct.product || undefined,
					productId: matchedProduct.productId,
					status: rowPartnerId ? "closed_won" : status,
					callCount: 0,
					followUpCount: 0,
					meetingCount: 0,
					followUpLogs: [],
					meetingLogs: [],
					notes: [],
				});

				if (phone) seenPhones.add(phone);
				if (gst) seenGsts.add(gst);
				leads.push(lead);

				// Partner rows are won deals from the start — track in CaseFiles.
				if (rowPartnerId) {
					try {
						await ensureCaseFileForLead(lead, req.user!);
					} catch (caseFileErr) {
						console.error("ensureCaseFileForLead failed:", caseFileErr);
					}
				}
			} catch (err: any) {
				errors.push({ row: rowNo, message: err.message });
			}
		}

		await ActivityLog.create({
			action: `${leads.length} leads imported via Excel`,
			user: req.user!._id,
			entityType: EntityType.LEAD,
			entityId: leads[0]?._id || req.user!._id,
			metadata: { count: leads.length, errors: errors.length },
		});

		const tId = getTenantId(req.user);
		if (leads.length > 0) emitLeadCreated(tId, leads[0]);

		res.status(201).json({
			success: true,
			total: rows.length,
			imported: leads.length,
			errors,
			leads,
		});
	} catch (error: any) {
		res.status(500).json({ success: false, message: error.message });
	}
};

export const downloadSampleExcel = async (
	_req: AuthRequest,
	res: Response,
): Promise<void> => {
	const wb = XLSX.utils.book_new();
	const headers = [
		"name",
		"phone",
		"email",
		"companyName",
		"addressLine",
		"city",
		"state",
		"pincode",
		"companyPan",
		"companyGst",
		"industry",
		"designation",
		"website",
		"alternatePhone",
		"priority",
        "status",
        "sourceType",
        "partner"
	];
	const sampleData = [
    {
        "name": "Rahul Sharma",
        "phone": "9876543210",
        "email": "rahul.sharma@technova.in",
        "companyName": "TechNova Solutions",
        "addressLine": "12 MG Road",
        "city": "Bengaluru",
        "state": "Karnataka",
        "pincode": "560001",
        "companyPan": "AABCT1234F",
        "companyGst": "29AABCT1234F1Z5",
        "industry": "IT Services",
        "designation": "Procurement Manager",
        "website": "https://www.technova.in",
        "alternatePhone": "9876543211",
        "priority": "very_high",
        "status": "new",
        "sourceType": "udyam",
        "partner": ""
    },
    {
        "name": "Priya Mehta",
        "phone": "9811122233",
        "email": "priya@greenleaf.co.in",
        "companyName": "GreenLeaf Organics",
        "addressLine": "45 AB Road",
        "city": "Indore",
        "state": "Madhya Pradesh",
        "pincode": "452001",
        "companyPan": "AACCG2345K",
        "companyGst": "23AACCG2345K1Z2",
        "industry": "Agriculture",
        "designation": "Director",
        "website": "https://www.greenleaf.co.in",
        "alternatePhone": "9811122244",
        "priority": "high",
        "status": "attempted",
        "sourceType": "self",
        "partner": ""
    },
    {
        "name": "Arjun Patel",
        "phone": "9898989898",
        "email": "arjun@apexmfg.com",
        "companyName": "Apex Manufacturing",
        "addressLine": "88 GIDC Estate",
        "city": "Ahmedabad",
        "state": "Gujarat",
        "pincode": "380015",
        "companyPan": "AAFCA3456L",
        "companyGst": "24AAFCA3456L1Z8",
        "industry": "Manufacturing",
        "designation": "Plant Head",
        "website": "https://www.apexmfg.com",
        "alternatePhone": "9898989899",
        "priority": "medium",
        "status": "connected",
        "sourceType": "partner",
        "partner": "Acme Corp"
    },
    {
        "name": "Sneha Kapoor",
        "phone": "9988776655",
        "email": "sneha@bluewave.in",
        "companyName": "BlueWave Logistics",
        "addressLine": "22 Port Road",
        "city": "Mumbai",
        "state": "Maharashtra",
        "pincode": "400001",
        "companyPan": "AACCB4567P",
        "companyGst": "27AACCB4567P1Z4",
        "industry": "Logistics",
        "designation": "Operations Manager",
        "website": "https://www.bluewave.in",
        "alternatePhone": "9988776656",
        "priority": "very_high",
        "status": "interested"
    },
    {
        "name": "Amit Verma",
        "phone": "9123456789",
        "email": "amit@zenithhealth.com",
        "companyName": "Zenith Healthcare",
        "addressLine": "10 Health Park",
        "city": "Delhi",
        "state": "Delhi",
        "pincode": "110001",
        "companyPan": "AACCH5678M",
        "companyGst": "07AACCH5678M1Z6",
        "industry": "Healthcare",
        "designation": "Administrator",
        "website": "https://www.zenithhealth.com",
        "alternatePhone": "9123456790",
        "priority": "high",
        "status": "callback_scheduled"
    },
    {
        "name": "Nisha Gupta",
        "phone": "9871234567",
        "email": "nisha@brightfuture.edu",
        "companyName": "Bright Future School",
        "addressLine": "School Road",
        "city": "Jaipur",
        "state": "Rajasthan",
        "pincode": "302001",
        "companyPan": "AACCB6789N",
        "companyGst": "08AACCB6789N1Z9",
        "industry": "Education",
        "designation": "Principal",
        "website": "https://www.brightfuture.edu",
        "alternatePhone": "9871234568",
        "priority": "very_high",
        "status": "meeting_scheduled"
    },
    {
        "name": "Karan Singh",
        "phone": "9991112233",
        "email": "karan@primeretail.in",
        "companyName": "Prime Retail Pvt Ltd",
        "addressLine": "Mall Road",
        "city": "Lucknow",
        "state": "Uttar Pradesh",
        "pincode": "226001",
        "companyPan": "AACCP7890Q",
        "companyGst": "09AACCP7890Q1Z3",
        "industry": "Retail",
        "designation": "Owner",
        "website": "https://www.primeretail.in",
        "alternatePhone": "9991112234",
        "priority": "low",
        "status": "not_interested"
    },
    {
        "name": "Mehul Shah",
        "phone": "9765432109",
        "email": "mehul@sunrisefoods.in",
        "companyName": "Sunrise Foods",
        "addressLine": "Industrial Area",
        "city": "Surat",
        "state": "Gujarat",
        "pincode": "395003",
        "companyPan": "AACCS8901R",
        "companyGst": "24AACCS8901R1Z1",
        "industry": "FMCG",
        "designation": "Purchase Officer",
        "website": "https://www.sunrisefoods.in",
        "alternatePhone": "9765432110",
        "priority": "medium",
        "status": "not_reachable"
    },
    {
        "name": "Pooja Arora",
        "phone": "9812345678",
        "email": "pooja@orbittech.com",
        "companyName": "Orbit Technologies",
        "addressLine": "IT Park Phase 2",
        "city": "Pune",
        "state": "Maharashtra",
        "pincode": "411001",
        "companyPan": "AACCO9012S",
        "companyGst": "27AACCO9012S1Z7",
        "industry": "Software",
        "designation": "HR Manager",
        "website": "https://www.orbittech.com",
        "alternatePhone": "9812345679",
        "priority": "low",
        "status": "do_not_call"
    },
    {
        "name": "Vikram Malhotra",
        "phone": "9870011223",
    "email": "vikram@metrobuilders.in",
    "companyName": "Metro Builders",
    "addressLine": "Civil Lines",
    "city": "Chandigarh",
    "state": "Chandigarh",
    "pincode": "160017",
    "companyPan": "AACCM0123T",
    "companyGst": "04AACCM0123T1Z2",
    "industry": "Construction",
    "designation": "Managing Director",
    "website": "https://www.metrobuilders.in",
    "alternatePhone": "9870011224",
    "priority": "very_high",
    "status": "closed_won"
  },
  {
    "name": "Ritu Bansal",
    "phone": "9988123456",
    "email": "ritu@skylinefinance.in",
    "companyName": "Skyline Finance",
    "addressLine": "Cyber City",
    "city": "Gurugram",
    "state": "Haryana",
    "pincode": "122001",
    "companyPan": "AACCS1234U",
    "companyGst": "06AACCS1234U1Z8",
    "industry": "Finance",
    "designation": "Branch Manager",
    "website": "https://www.skylinefinance.in",
    "alternatePhone": "9988123457",
    "priority": "high",
    "status": "closed_lost"
  }
];


	const ws = XLSX.utils.json_to_sheet(sampleData, { header: headers });
	XLSX.utils.book_append_sheet(wb, ws, "Leads");

	const colWidths = headers.map((h) => ({ wch: Math.max(h.length, 20) }));
	ws["!cols"] = colWidths;
	if (ws["!ref"]) (ws as any)["!autofilter"] = { ref: ws["!ref"] };

	const instructions = [
		["Lead Import – Instructions (read first, then fill the Leads sheet)"],
		["Fill one lead per row on the Leads sheet. Do not rename the column headers."],
		[],
		["Column", "Required?", "Notes"],
		["name", "Yes", "Full name of the lead"],
		["phone", "No, but recommended", "10 digits; duplicates (in file or already saved) are skipped with an error"],
		["email", "No", "Must be a valid email when given"],
		["companyName", "No", "Company / organisation name"],
		["designation", "No", "Job title"],
		["industry", "No", "Free text"],
		["addressLine / city / state / pincode", "No", "Pincode must be 6 digits when given"],
		["companyPan", "No", "Auto-filled from companyGst when left blank"],
		["companyGst", "No", "15 characters; duplicates are skipped with an error"],
		["website / alternatePhone", "No", "Alternate phone must be 10 digits when given"],
		["priority", "No", "One of: very high, high, medium, low (default medium)"],
		["status", "No", "One of: new, attempted, connected, interested, callback_scheduled, meeting_scheduled, not_interested, not_reachable, do_not_call, closed_won, closed_lost (default new)"],
		["sourceType", "No", "One of: udyam, self, partner (default udyam). udyam = Udyam Capital, self = you"],
		["partner", "Only when sourceType is partner", "Must exactly match a partner company or person name"],
		[],
		["Limits", "", "Max 2000 rows per import. Rows with errors are skipped; the rest are imported."],
	];
	const wsHelp = XLSX.utils.aoa_to_sheet(instructions);
	wsHelp["!cols"] = [{ wch: 34 }, { wch: 34 }, { wch: 90 }];
	XLSX.utils.book_append_sheet(wb, wsHelp, "Instructions");

	const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

	res.setHeader(
		"Content-Type",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	);
	res.setHeader(
		"Content-Disposition",
		'attachment; filename="lead-import-template.xlsx"',
	);
	res.send(buffer);
};

// Partner-scoped import template: every row is attached to the given partner,
// so the file omits the source attribution columns and names the target
// partner in the instructions sheet instead.
export const downloadPartnerSampleExcel = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		const tenantId = getTenantId(req.user);
		const partner = await Partner.findOne({
			_id: req.params.partnerId,
			tenantId,
		});
		if (!partner) {
			res.status(404).json({ success: false, message: "Partner not found" });
			return;
		}
		const partnerName =
			(partner as any).companyName ||
			(partner as any).name ||
			(partner as any).personName ||
			"Partner";

		const wb = XLSX.utils.book_new();
		const headers = [
			"name",
			"phone",
			"email",
			"companyName",
			"product",
			"addressLine",
			"city",
			"state",
			"pincode",
			"companyPan",
			"companyGst",
			"industry",
			"designation",
			"website",
			"alternatePhone",
			"priority",
		];
		const sampleData = [
			{
				name: "Rahul Sharma",
				phone: "9876543210",
				email: "rahul.sharma@technova.in",
				companyName: "TechNova Solutions",
				product: "Term Loan",
				addressLine: "12 MG Road",
				city: "Bengaluru",
				state: "Karnataka",
				pincode: "560001",
				companyPan: "AABCT1234F",
				companyGst: "29AABCT1234F1Z5",
				industry: "IT Services",
				designation: "Procurement Manager",
				website: "https://www.technova.in",
				alternatePhone: "9876543211",
				priority: "very_high",
			},
			{
				name: "Priya Mehta",
				phone: "9811122233",
				email: "priya@greenleaf.co.in",
				companyName: "GreenLeaf Organics",
				product: "Working Capital Loan",
				addressLine: "45 AB Road",
				city: "Indore",
				state: "Madhya Pradesh",
				pincode: "452001",
				companyPan: "AACCG2345K",
				companyGst: "23AACCG2345K1Z2",
				industry: "Agriculture",
				designation: "Director",
				website: "https://www.greenleaf.co.in",
				alternatePhone: "9811122244",
				priority: "high",
			},
			{
				name: "Arjun Patel",
				phone: "9898989898",
				email: "arjun@apexmfg.com",
				companyName: "Apex Manufacturing",
				product: "Business Loan",
				addressLine: "88 GIDC Estate",
				city: "Ahmedabad",
				state: "Gujarat",
				pincode: "380015",
				companyPan: "AAFCA3456L",
				companyGst: "24AAFCA3456L1Z8",
				industry: "Manufacturing",
				designation: "Plant Head",
				website: "https://www.apexmfg.com",
				alternatePhone: "9898989899",
				priority: "medium",
			},
		];

		// Title block on top of the sheet: the file itself states which partner
		// the leads are imported into, even after it is saved or forwarded.
		const aoa: any[][] = [
			[`LEAD IMPORT — ${partnerName}`],
			[
				"All leads added below are imported for this partner only and marked Closed Won (source: Partner). Keep the column headers unchanged — the rows above them are skipped automatically.",
			],
			[],
			headers,
			...sampleData.map((row) =>
				headers.map((h) => (row as any)[h] ?? ""),
			),
		];
		const ws = XLSX.utils.aoa_to_sheet(aoa);
		XLSX.utils.book_append_sheet(wb, ws, "Leads");

		const colWidths = headers.map((h) => ({ wch: Math.max(h.length, 20) }));
		ws["!cols"] = colWidths;
		const lastCol = XLSX.utils.encode_col(headers.length - 1);
		(ws as any)["!autofilter"] = { ref: `A4:${lastCol}${aoa.length}` };

		const instructions = [
			[`Lead Import — ${partnerName}`],
			[
				"Every row on the Leads sheet is imported for this partner only; the source is set automatically.",
			],
			["Do not rename the column headers. Fill one lead per row."],
			[],
			["Column", "Required?", "Notes"],
			["name", "Yes", "Full name of the lead"],
			[
				"phone",
				"No, but recommended",
				"10 digits; duplicates (in file or already saved) are skipped with an error",
			],
			["email", "No", "Must be a valid email when given"],
			["companyName", "No", "Company / organisation name"],
			[
				"product",
				"Yes",
				"Product the partner gave this lead for — matched against your product catalog; feeds the Files tracker",
			],
			["designation", "No", "Job title"],
			["industry", "No", "Free text"],
			[
				"addressLine / city / state / pincode",
				"No",
				"Pincode must be 6 digits when given",
			],
			["companyPan", "No", "Auto-filled from companyGst when left blank"],
			[
				"companyGst",
				"No",
				"15 characters; duplicates are skipped with an error",
			],
			[
				"website / alternatePhone",
				"No",
				"Alternate phone must be 10 digits when given",
			],
			[
				"priority",
				"No",
				"One of: very high, high, medium, low (default medium)",
			],
			[
				"status",
				"Auto",
				"Not required — every lead in this file is saved as Closed Won",
			],
			[],
			[
				"Source",
				"",
				`All imported leads are attributed to: ${partnerName} (source: partner) and saved as Closed Won`,
			],
			[
				"Limits",
				"",
				"Max 2000 rows per import. Rows with errors are skipped; the rest are imported.",
			],
		];
		const wsHelp = XLSX.utils.aoa_to_sheet(instructions);
		wsHelp["!cols"] = [{ wch: 34 }, { wch: 34 }, { wch: 90 }];
		XLSX.utils.book_append_sheet(wb, wsHelp, "Instructions");

		const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
		const safeName =
			partnerName
				.replace(/[^\w.-]+/g, "-")
				.replace(/^-+|-+$/g, "")
				.slice(0, 40) || "partner";

		res.setHeader(
			"Content-Type",
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		);
		res.setHeader(
			"Content-Disposition",
			`attachment; filename="lead-import-${safeName}.xlsx"`,
		);
		res.send(buffer);
	} catch (error: any) {
		res.status(500).json({ success: false, message: error.message });
	}
};

export const getLeadCounts = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		const tenantId = getTenantId(req.user);
		const { databaseId, partnerId, search, industry, source, priority, city, state, pincode } = req.query;

		const baseFilter: any = { tenantId };
		let databaseOr: any[] | null = null;
		let searchOr: any[] | null = null;

		if (databaseId === '__none__') {
			const allDatabaseIds = await Database.find({ tenantId }).distinct('_id');
			baseFilter.databaseId = { $nin: allDatabaseIds };
		} else {
			if (databaseId) baseFilter.databaseId = databaseId;

			const accessible = await getAccessibleDatabaseIds(req.user, tenantId);
			if (accessible) {
				if (databaseId) {
					const hasAccess = accessible.some((id: any) => id.toString() === databaseId);
					if (!hasAccess) {
						res.json({ success: true, counts: { all: 0, archived: 0, meeting_scheduled: 0, closed_won: 0 } });
						return;
					}
				} else {
					const allDatabaseIds = await Database.find({ tenantId }).distinct('_id');
					databaseOr = [
						{ databaseId: { $in: accessible } },
						{ databaseId: { $nin: allDatabaseIds } },
					];
				}
			}
		}

		if (industry) baseFilter.industry = industry;
		if (source) baseFilter.source = source;
		if (partnerId) baseFilter.partnerId = partnerId;
		if (priority) baseFilter.priority = priority;
		if (city) baseFilter.city = city;
		if (state) baseFilter.state = state;
		if (pincode) baseFilter.pincode = pincode;
		if (search) {
			const q = String(search).trim();
			const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const digits = q.replace(/\D/g, '');
			const regex = new RegExp(escaped, "i");
			searchOr = [
				{ name: regex },
				{ companyName: regex },
				{ email: regex },
				{ designation: regex },
				{ companyPan: regex },
				{ companyGst: regex },
				{ addressLine: regex },
				{ city: regex },
				{ state: regex },
				{ pincode: regex },
			];
			if (digits.length >= 3) {
				const digitsRegex = new RegExp(digits, "i");
				searchOr.push({ phone: digitsRegex });
				searchOr.push({ alternatePhone: digitsRegex });
			}
		}

		if (databaseOr && searchOr) {
			baseFilter.$and = [{ $or: databaseOr }, { $or: searchOr }];
		} else if (databaseOr) {
			baseFilter.$or = databaseOr;
		} else if (searchOr) {
			baseFilter.$or = searchOr;
		}

		const [allCount, archivedCount, meetingScheduledCount, closedWonCount] =
			await Promise.all([
				Lead.countDocuments(baseFilter),
				Lead.countDocuments({
					...baseFilter,
					status: {
						$in: ["not_interested", "do_not_call", "closed_lost"],
					},
				}),
				Lead.countDocuments({
					...baseFilter,
					status: "meeting_scheduled",
				}),
				Lead.countDocuments({ ...baseFilter, status: "closed_won" }),
			]);

		res.json({
			success: true,
			counts: {
				all: allCount,
				archived: archivedCount,
				meeting_scheduled: meetingScheduledCount,
				closed_won: closedWonCount,
			},
		});
	} catch (error: any) {
		res.status(500).json({ success: false, message: error.message });
	}
};

export const getUpcomingFollowups = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		const tenantId = getTenantId(req.user);
		const { tab, search, status, dateFrom, dateTo } = req.query;
		const page = Math.max(1, parseInt(req.query.page as string) || 1);
		const limit = Math.min(500, Math.max(1, parseInt(req.query.limit as string) || 100));
		const skip = (page - 1) * limit;

		const tenantMatch: any = { tenantId };

		const accessible = await getAccessibleDatabaseIds(req.user, tenantId);
		if (accessible) {
			tenantMatch.databaseId = { $in: accessible };
		}

		const buildDateRange = () => {
			if (!dateFrom && !dateTo) return null;
			const conds: any[] = [];
			if (dateFrom) {
				const d = new Date(dateFrom as string);
				conds.push({ nextFollowupAt: { $gte: d } });
				conds.push({ meetingAt: { $gte: d } });
			}
			if (dateTo) {
				const d = new Date(dateTo as string);
				d.setHours(23, 59, 59, 999);
				conds.push({ nextFollowupAt: { $lte: d } });
				conds.push({ meetingAt: { $lte: d } });
			}
			if (conds.length === 0) return null;
			if (dateFrom && dateTo) {
				return {
					$or: [
						{ nextFollowupAt: { $gte: new Date(dateFrom as string), $lte: new Date(dateTo as string) } },
						{ meetingAt: { $gte: new Date(dateFrom as string), $lte: new Date(dateTo as string) } },
					],
				};
			}
			if (dateFrom) {
				return { $or: [{ nextFollowupAt: { $gte: new Date(dateFrom as string) } }, { meetingAt: { $gte: new Date(dateFrom as string) } }] };
			}
			return { $or: [{ nextFollowupAt: { $lte: new Date(dateTo as string) } }, { meetingAt: { $lte: new Date(dateTo as string) } }] };
		};

		const buildFilter = (t?: string) => {
			const conds: any[] = [{ ...tenantMatch }];
			if (t === 'meetings') {
				conds.push({ $or: [{ scheduleType: 'meeting' }, { meetingAt: { $ne: null } }] });
			} else if (t === 'followups') {
				conds.push({
					$and: [
						{ nextFollowupAt: { $ne: null } },
						{ $or: [{ scheduleType: { $ne: 'meeting' } }, { scheduleType: { $exists: false } }] },
					],
				});
			} else {
				conds.push({ $or: [{ nextFollowupAt: { $ne: null } }, { meetingAt: { $ne: null } }] });
			}
			if (status) conds.push({ status: status as string });
			const dr = buildDateRange();
			if (dr) conds.push(dr);
			return conds.length === 1 ? conds[0] : { $and: conds };
		};

		let filter = buildFilter(tab as string);

		if (search) {
			const q = String(search).trim();
			const digits = q.replace(/\D/g, '');
			const isPhone = digits.length >= 6;
			let searchCond;
			if (isPhone) {
				searchCond = { $or: [{ phone: { $regex: digits, $options: 'i' } }] };
			} else {
				const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
				searchCond = {
					$or: [
						{ name: { $regex: escaped, $options: 'i' } },
						{ companyName: { $regex: escaped, $options: 'i' } },
						{ phone: { $regex: escaped, $options: 'i' } },
					],
				};
			}
			if (filter.$and) {
				filter.$and.push(searchCond);
			} else if (filter.$or) {
				const existingOr = filter.$or;
				delete filter.$or;
				filter = { $and: [filter, searchCond] };
			} else {
				filter = { ...filter, ...searchCond };
			}
		}

		const buildCountFilter = (t?: string) => {
			const conds: any[] = [{ ...tenantMatch }];
			if (t === 'meetings') {
				conds.push({ $or: [{ scheduleType: 'meeting' }, { meetingAt: { $ne: null } }] });
			} else if (t === 'followups') {
				conds.push({
					$and: [
						{ nextFollowupAt: { $ne: null } },
						{ $or: [{ scheduleType: { $ne: 'meeting' } }, { scheduleType: { $exists: false } }] },
					],
				});
			} else {
				conds.push({ $or: [{ nextFollowupAt: { $ne: null } }, { meetingAt: { $ne: null } }] });
			}
			const dr = buildDateRange();
			if (dr) conds.push(dr);
			return conds.length === 1 ? conds[0] : { $and: conds };
		};

		const [leads, total, [countAll, countMeetings, countFollowups]] = await Promise.all([
			Lead.find(filter)
				.populate("databaseId", "name")
				.sort({ nextFollowupAt: 1, meetingAt: 1 })
				.skip(skip)
				.limit(limit),
			Lead.countDocuments(filter),
			Promise.all([
				Lead.countDocuments(buildCountFilter()),
				Lead.countDocuments(buildCountFilter('meetings')),
				Lead.countDocuments(buildCountFilter('followups')),
			]),
		]);

		res.json({
			success: true,
			leads,
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
			counts: { all: countAll, meetings: countMeetings, followups: countFollowups },
		});
	} catch (error: any) {
		res.status(500).json({ success: false, message: error.message });
	}
};

export const updateMeetingStatus = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		const { meetingStatus } = req.body;
		if (!meetingStatus || !['scheduled', 'done', 'canceled'].includes(meetingStatus)) {
			res.status(400).json({ success: false, message: 'Invalid meeting status' });
			return;
		}

		const lead = await Lead.findById(req.params.id);
		if (!lead) {
			res.status(404).json({ success: false, message: "Lead not found" });
			return;
		}

		lead.meetingStatus = meetingStatus;

		if (meetingStatus === 'done') {
			lead.status = 'closed_won';
		} else if (meetingStatus === 'canceled') {
			lead.status = 'callback_scheduled';
			lead.scheduleType = 'follow_up';
			lead.meetingAt = undefined;
		}

		if (lead.meetingLogs.length > 0) {
			const lastMeeting = lead.meetingLogs[lead.meetingLogs.length - 1];
			lastMeeting.status = meetingStatus;
		}

		await lead.save();

		const populated = await Lead.findById(lead._id)
			.populate("databaseId", "name")
			.populate("notes.createdBy", "name email avatar");

		await ActivityLog.create({
			action: `Meeting ${meetingStatus}`,
			user: req.user!._id,
			entityType: EntityType.LEAD,
			entityId: lead._id,
			metadata: {
				name: lead.name,
				meetingStatus,
				meetingMode: lead.meetingMode,
				phone: lead.phone,
				company: lead.companyName,
			},
		});

		emitLeadUpdated(getTenantId(req.user), populated);

		if (meetingStatus === "done") {
			await ensureCaseFileForLead(lead, req.user!);
		}

		res.json({ success: true, lead: populated });
	} catch (error: any) {
		res.status(400).json({ success: false, message: error.message });
	}
};

export const getLeadStats = async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const tenantId = getTenantId(req.user);
		const accessible = await getAccessibleDatabaseIds(req.user, tenantId);

		const match: any = { tenantId: new mongoose.Types.ObjectId(tenantId) };

		if (accessible) {
			const allDatabaseIds = await Database.find({ tenantId }).distinct('_id');
			match.$or = [
				{ databaseId: { $in: accessible } },
				{ databaseId: { $nin: allDatabaseIds } },
			];
		}

		const stats = await Lead.aggregate([
			{ $match: match },
			{
				$group: {
					_id: null,
					total: { $sum: 1 },
					totalCallDuration: { $sum: "$callDuration" },
					won: { $sum: { $cond: [{ $eq: ["$status", "closed_won"] }, 1, 0] } },
					lost: { $sum: { $cond: [{ $eq: ["$status", "closed_lost"] }, 1, 0] } },
					active: {
						$sum: {
							$cond: [
								{ $in: ["$status", ["closed_won", "closed_lost", "do_not_call", "not_interested"]] },
								0,
								1
							]
						}
					},
					statuses: { $push: "$status" },
				},
			},
		]);

		const statusCounts: Record<string, number> = {};
		if (stats.length > 0) {
			stats[0].statuses.forEach((s: string) => {
				statusCounts[s] = (statusCounts[s] || 0) + 1;
			});
		}

		res.json({
			success: true,
			stats: {
				total: stats[0]?.total || 0,
				won: stats[0]?.won || 0,
				lost: stats[0]?.lost || 0,
				active: stats[0]?.active || 0,
				totalCallDuration: stats[0]?.totalCallDuration || 0,
				statusCounts,
			},
		});
	} catch (error: any) {
		res.status(500).json({ success: false, message: error.message });
	}
};

export const getLeadFilterOptions = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		const tenantId = getTenantId(req.user);
		const { databaseId, status, search } = req.query;

		const filter: any = { tenantId: new mongoose.Types.ObjectId(tenantId) };
		let databaseOr: any[] | null = null;
		let searchOr: any[] | null = null;

		if (databaseId === '__none__') {
			const allDatabaseIds = await Database.find({ tenantId }).distinct('_id');
			filter.databaseId = { $nin: allDatabaseIds };
		} else {
			if (databaseId) filter.databaseId = new mongoose.Types.ObjectId(databaseId as string);

			const accessible = await getAccessibleDatabaseIds(req.user, tenantId);
			if (accessible) {
				if (databaseId) {
					const hasAccess = accessible.some((id: any) => id.toString() === databaseId);
					if (!hasAccess) {
						res.json({ success: true, options: { industries: [], sources: [], cities: [], states: [], pincodes: [] } });
						return;
					}
				} else {
					const allDatabaseIds = await Database.find({ tenantId }).distinct('_id');
					databaseOr = [
						{ databaseId: { $in: accessible } },
						{ databaseId: { $nin: allDatabaseIds } },
					];
				}
			}
		}

		if (status) {
			const statuses = String(status).split(",").map(s => s.trim()).filter(Boolean);
			if (statuses.length === 1) {
				filter.status = statuses[0];
			} else if (statuses.length > 1) {
				filter.status = { $in: statuses };
			}
		}

		if (search) {
			const q = String(search).trim();
			const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			searchOr = [
				{ name: { $regex: escaped, $options: 'i' } },
				{ companyName: { $regex: escaped, $options: 'i' } },
				{ email: { $regex: escaped, $options: 'i' } },
				{ designation: { $regex: escaped, $options: 'i' } },
				{ companyPan: { $regex: escaped, $options: 'i' } },
				{ companyGst: { $regex: escaped, $options: 'i' } },
				{ addressLine: { $regex: escaped, $options: 'i' } },
				{ city: { $regex: escaped, $options: 'i' } },
				{ state: { $regex: escaped, $options: 'i' } },
				{ pincode: { $regex: escaped, $options: 'i' } },
			];
		}

		if (databaseOr && searchOr) {
			filter.$and = [{ $or: databaseOr }, { $or: searchOr }];
		} else if (databaseOr) {
			filter.$or = databaseOr;
		} else if (searchOr) {
			filter.$or = searchOr;
		}

		const [result] = await Lead.aggregate([
			{ $match: filter },
			{
				$group: {
					_id: null,
					industries: { $addToSet: "$industry" },
					sources: { $addToSet: "$source" },
					cities: { $addToSet: "$city" },
					states: { $addToSet: "$state" },
					pincodes: { $addToSet: "$pincode" },
				},
			},
		]);

		const clean = (arr: any[]) =>
			(arr || []).filter(Boolean).map(String).sort();

		res.json({
			success: true,
			options: {
				industries: clean(result?.industries),
				sources: clean(result?.sources),
				cities: clean(result?.cities),
				states: clean(result?.states),
				pincodes: clean(result?.pincodes),
			},
		});
	} catch (error: any) {
		res.status(500).json({ success: false, message: error.message });
	}
};
