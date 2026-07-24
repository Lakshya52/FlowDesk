import { Response } from "express";
import mongoose from "mongoose";
import Lead from "../models/Lead";
import Campaign from "../models/Campaign";
import ActivityLog, { EntityType } from "../models/ActivityLog";
import { AuthRequest } from "../middlewares/auth";
import XLSX from "xlsx";
import { emitLeadCreated, emitLeadUpdated, emitLeadDeleted } from "../services/crmSocketService";

const getAccessibleCampaignIds = async (user: any, tenantId: string) => {
    if (user.role === 'admin' || user.role === 'manager') return null;
    return Campaign.find({ tenantId, $or: [{ people: user._id }, { createdBy: user._id }] }).distinct('_id');
};

const getTenantId = (user: any): string =>
	(user.tenantId?._id || user.tenantId).toString();

export const getLeads = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		const tenantId = getTenantId(req.user);
		const { campaignId, status, search, industry, source, priority, city, state, pincode } =
			req.query;
		const page = Math.max(1, parseInt(req.query.page as string) || 1);
		const limit = Math.max(
			1,
			parseInt(req.query.limit as string) || 100000,
		);
		const skip = (page - 1) * limit;

		const filter: any = { tenantId };
		let campaignOr: any[] | null = null;
		let searchOr: any[] | null = null;

		if (campaignId === '__none__') {
			const allCampaignIds = await Campaign.find({ tenantId }).distinct('_id');
			filter.campaignId = { $nin: allCampaignIds };
		} else {
			if (campaignId) filter.campaignId = campaignId;

			const accessible = await getAccessibleCampaignIds(req.user, tenantId);
			if (accessible) {
				if (campaignId) {
					const hasAccess = accessible.some((id: any) => id.toString() === campaignId);
					if (!hasAccess) {
						res.json({ success: true, leads: [], total: 0, page, limit, totalPages: 0 });
						return;
					}
				} else {
					const allCampaignIds = await Campaign.find({ tenantId }).distinct('_id');
					campaignOr = [
						{ campaignId: { $in: accessible } },
						{ campaignId: { $nin: allCampaignIds } },
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

		if (campaignOr && searchOr) {
			filter.$and = [{ $or: campaignOr }, { $or: searchOr }];
		} else if (campaignOr) {
			filter.$or = campaignOr;
		} else if (searchOr) {
			filter.$or = searchOr;
		}

		const [leads, total] = await Promise.all([
			Lead.find(filter)
				.populate("campaignId", "name")
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
			.populate("campaignId", "name")
			.populate("notes.createdBy", "name email avatar");

		if (!lead) {
			res.status(404).json({ success: false, message: "Lead not found" });
			return;
		}

		const accessible = await getAccessibleCampaignIds(req.user, lead.tenantId.toString());
		if (accessible) {
			const hasAccess = accessible.some((id: any) => id.toString() === lead.campaignId._id?.toString() || id.toString() === lead.campaignId.toString());
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

		const source =
			req.user!.role === "admin" ? "Udyam Capital" : req.user!.name;
		if (!req.body.campaignId) delete req.body.campaignId;
		const lead = await Lead.create({
			...req.body,
			tenantId,
			source,
			status: "new",
			callCount: 0,
			followUpCount: 0,
			meetingCount: 0,
			followUpLogs: [],
			meetingLogs: [],
			notes: [],
		});

		const populated = await Lead.findById(lead._id).populate(
			"campaignId",
			"name",
		);

		await ActivityLog.create({
			action: "Lead created",
			user: req.user!._id,
			entityType: EntityType.LEAD,
			entityId: lead._id,
			metadata: { name: lead.name },
		});

		emitLeadCreated(tenantId, populated);

		res.status(201).json({ success: true, lead: populated });
	} catch (error: any) {
		res.status(400).json({ success: false, message: error.message });
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
		Object.assign(lead, req.body);

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
			});
		}

		await lead.save();

		const populated = await Lead.findById(lead._id)
			.populate("campaignId", "name")
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

		const tId = getTenantId(req.user);
		emitLeadUpdated(tId, populated);

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
			.populate("campaignId", "name")
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
		const rows: any[] = XLSX.utils.sheet_to_json(
			workbook.Sheets[sheetName],
		);
		const campaignId = req.body.campaignId;

		if (rows.length === 0) {
			res.status(400).json({
				success: false,
				message: "Excel file is empty",
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

		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			try {
				if (!row.name && !row.Name && !row.NAME) {
					errors.push({ row: i + 1, message: "Missing name" });
					continue;
				}

				const phone = String(row.phone || row.Phone || row.PHONE || "").trim();
				if (phone && existingPhoneSet.has(phone)) {
					errors.push({ row: i + 1, message: `Duplicate phone: ${phone}` });
					continue;
				}

				const gst = String(row.companyGst || row["Company GST"] || row.company_gst || row.GST || row.gst || "").trim().toUpperCase();
				if (gst && existingGstSet.has(gst)) {
					errors.push({ row: i + 1, message: `Duplicate GST: ${gst}` });
					continue;
				}

				const 				lead = await Lead.create({
					campaignId,
					tenantId,
					name: row.name || row.Name || row.NAME || "",
					designation: row.designation || row.Designation || "",
					phone:
						row.phone || row.Phone || row.PHONE
							? String(row.phone || row.Phone || row.PHONE)
							: undefined,
					alternatePhone:
						row.alternatePhone ||
						row["Alternate Phone"] ||
						row.alternate_phone
							? String(
									row.alternatePhone ||
										row["Alternate Phone"] ||
										row.alternate_phone,
								)
							: undefined,
					companyName:
						row.companyName ||
						row.Company ||
						row["Company Name"] ||
						row.company_name ||
						"",
					addressLine:
						row.addressLine ||
						row["Address Line"] ||
						row.address_line ||
						"",
					city: row.city || row.City || "",
					state: row.state || row.State || "",
					pincode:
						row.pincode || row.Pincode || row.PINCODE
							? String(row.pincode || row.Pincode || row.PINCODE)
							: undefined,
					companyPan:
						row.companyPan ||
						row["Company PAN"] ||
						row.company_pan ||
						"",
					companyGst: String(
						row.companyGst ||
						row["Company GST"] ||
						row.company_gst ||
						row.GST ||
						row.gst ||
						""
					).trim().toUpperCase(),
					industry: row.industry || row.Industry || "",
					email:
						row.email || row.Email || row.EMAIL
							? String(
									row.email || row.Email || row.EMAIL,
								).toLowerCase()
							: undefined,
					website: row.website || row.Website || "",
					priority: (row.priority || row.Priority || "medium")
						.toLowerCase()
						.replace("_", " "),
					source:
						req.user!.role === "admin"
							? "Udyam Capital"
							: req.user!.name,
					status: row.status || "new",
					callCount: 0,
					followUpCount: 0,
					meetingCount: 0,
					followUpLogs: [],
					meetingLogs: [],
					notes: [],
				});

				leads.push(lead);
			} catch (err: any) {
				errors.push({ row: i + 1, message: err.message });
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
        "status"
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
        "status": "new"
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
        "status": "attempted"
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
        "status": "connected"
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

export const getLeadCounts = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		const tenantId = getTenantId(req.user);
		const { campaignId, search, industry, source, priority, city, state, pincode } = req.query;

		const baseFilter: any = { tenantId };
		let campaignOr: any[] | null = null;
		let searchOr: any[] | null = null;

		if (campaignId === '__none__') {
			const allCampaignIds = await Campaign.find({ tenantId }).distinct('_id');
			baseFilter.campaignId = { $nin: allCampaignIds };
		} else {
			if (campaignId) baseFilter.campaignId = campaignId;

			const accessible = await getAccessibleCampaignIds(req.user, tenantId);
			if (accessible) {
				if (campaignId) {
					const hasAccess = accessible.some((id: any) => id.toString() === campaignId);
					if (!hasAccess) {
						res.json({ success: true, counts: { all: 0, archived: 0, meeting_scheduled: 0, closed_won: 0 } });
						return;
					}
				} else {
					const allCampaignIds = await Campaign.find({ tenantId }).distinct('_id');
					campaignOr = [
						{ campaignId: { $in: accessible } },
						{ campaignId: { $nin: allCampaignIds } },
					];
				}
			}
		}

		if (industry) baseFilter.industry = industry;
		if (source) baseFilter.source = source;
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

		if (campaignOr && searchOr) {
			baseFilter.$and = [{ $or: campaignOr }, { $or: searchOr }];
		} else if (campaignOr) {
			baseFilter.$or = campaignOr;
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

		const accessible = await getAccessibleCampaignIds(req.user, tenantId);
		if (accessible) {
			tenantMatch.campaignId = { $in: accessible };
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
				.populate("campaignId", "name")
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
			.populate("campaignId", "name")
			.populate("notes.createdBy", "name email avatar");

		await ActivityLog.create({
			action: `Meeting ${meetingStatus}`,
			user: req.user!._id,
			entityType: EntityType.LEAD,
			entityId: lead._id,
			metadata: {
				name: lead.name,
				meetingStatus,
				phone: lead.phone,
				company: lead.companyName,
			},
		});

		res.json({ success: true, lead: populated });
	} catch (error: any) {
		res.status(400).json({ success: false, message: error.message });
	}
};

export const getLeadStats = async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const tenantId = getTenantId(req.user);
		const accessible = await getAccessibleCampaignIds(req.user, tenantId);

		const match: any = { tenantId: new mongoose.Types.ObjectId(tenantId) };

		if (accessible) {
			const allCampaignIds = await Campaign.find({ tenantId }).distinct('_id');
			match.$or = [
				{ campaignId: { $in: accessible } },
				{ campaignId: { $nin: allCampaignIds } },
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
		const { campaignId, status, search } = req.query;

		const filter: any = { tenantId };
		let campaignOr: any[] | null = null;
		let searchOr: any[] | null = null;

		if (campaignId === '__none__') {
			const allCampaignIds = await Campaign.find({ tenantId }).distinct('_id');
			filter.campaignId = { $nin: allCampaignIds };
		} else {
			if (campaignId) filter.campaignId = campaignId;

			const accessible = await getAccessibleCampaignIds(req.user, tenantId);
			if (accessible) {
				if (campaignId) {
					const hasAccess = accessible.some((id: any) => id.toString() === campaignId);
					if (!hasAccess) {
						res.json({ success: true, options: { industries: [], sources: [], cities: [], states: [], pincodes: [] } });
						return;
					}
				} else {
					const allCampaignIds = await Campaign.find({ tenantId }).distinct('_id');
					campaignOr = [
						{ campaignId: { $in: accessible } },
						{ campaignId: { $nin: allCampaignIds } },
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

		if (campaignOr && searchOr) {
			filter.$and = [{ $or: campaignOr }, { $or: searchOr }];
		} else if (campaignOr) {
			filter.$or = campaignOr;
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
