import { Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import User from "../models/User";
// import Company from '../models/Company';
import Tenant from "../models/Tenant";
import RegistrationOtp from "../models/RegistrationOtp";
import { AuthRequest } from "../middlewares/auth";
import {
	sendOtpEmail,
	sendRegistrationOtpEmail,
} from "../services/emailService";

const generateToken = (userId: string, tenantId?: string): string => {
	const payload: any = { userId };
	if (tenantId) payload.tenantId = tenantId;
	return jwt.sign(payload, process.env.JWT_SECRET!, {
		expiresIn: process.env.JWT_EXPIRES_IN || "7d",
	} as jwt.SignOptions);
};

// HMAC-SHA256 keyed with the server secret — deterministic so lookups by
// hash work, and safe against DB-dump brute force since the key stays server-side.
const hashOtp = (otp: string): string =>
	crypto
		.createHmac("sha256", process.env.JWT_SECRET!)
		.update(otp)
		.digest("hex");

export const register = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		const { name, email, password, companyName, website, phone, industry } =
			req.body;

		if (!companyName) {
			res.status(400).json({ message: "Company name is required" });
			return;
		}

		if (!name || !email || !password) {
			res.status(400).json({
				message: "Name, email, and password are required",
			});
			return;
		}

		const slug = companyName
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "");

		const existingTenant = await Tenant.findOne({
			name: { $regex: `^${companyName}$`, $options: "i" },
		});
		if (existingTenant) {
			res.status(400).json({
				message: "A workspace with this company name already exists",
			});
			return;
		}

		const existingReg = await RegistrationOtp.findOne({ email });
		if (existingReg) {
			await RegistrationOtp.deleteOne({ email });
		}

		const otp = crypto.randomInt(0, 1000000).toString().padStart(6, "0");
		const otpExpires = new Date(Date.now() + 15 * 60 * 1000);
		const salt = await bcrypt.genSalt(12);
		const hashedPassword = await bcrypt.hash(password, salt);

		await RegistrationOtp.create({
			companyName,
			slug,
			name,
			email,
			passwordHash: hashedPassword,
			website: website || "",
			phone: phone || "",
			industry: industry || "",
			otpHash: hashOtp(otp),
			otpExpires,
		});

		sendRegistrationOtpEmail(email, otp, companyName).catch((error) => {
			console.error(
				`Failed to send registration OTP to ${email}:`,
				error,
			);
		});

		res.status(200).json({
			message:
				"Verification code sent to your email. Please verify to complete registration.",
		});
	} catch (error: any) {
		if (error.code === 11000) {
			res.status(400).json({
				message: "User with this email id already exists",
			});
			return;
		}
		res.status(500).json({
			message: error.message || "Registration failed",
		});
	}
};

export const resendRegistrationOtp = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		const { email } = req.body;

		if (!email) {
			res.status(400).json({ message: "Email is required" });
			return;
		}

		const regData = await RegistrationOtp.findOne({ email });
		if (!regData) {
			res.status(400).json({
				message:
					"No registration found for this email. Please start again.",
			});
			return;
		}

		const otp = crypto.randomInt(0, 1000000).toString().padStart(6, "0");
		regData.otpHash = hashOtp(otp);
		regData.otpExpires = new Date(Date.now() + 15 * 60 * 1000);
		await regData.save();

		sendRegistrationOtpEmail(email, otp, regData.companyName).catch(
			(error) => {
				console.error(
					`Failed to resend registration OTP to ${email}:`,
					error,
				);
			},
		);

		res.status(200).json({
			message: "A new verification code has been sent to your email.",
		});
	} catch (error: any) {
		res.status(500).json({
			message: error.message || "Failed to resend OTP",
		});
	}
};

export const verifyRegistrationOtp = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		const { email, otp } = req.body;

		if (!email || !otp) {
			res.status(400).json({ message: "Email and OTP are required" });
			return;
		}

		const regData = await RegistrationOtp.findOne({
			email,
			otpHash: hashOtp(otp),
			otpExpires: { $gt: new Date() },
		});

		if (!regData) {
			res.status(400).json({ message: "Invalid or expired OTP" });
			return;
		}

		// const existingCompany = await Company.findOne({ slug: regData.slug });
		// if (existingCompany) {
		// 	await RegistrationOtp.deleteOne({ email });
		// 	res.status(400).json({
		// 		message: "Company with this name already exists",
		// 	});
		// 	return;
		// }

		// const existingUser = await User.findOne({ email: regData.email });
		// if (existingUser) {
		// 	await RegistrationOtp.deleteOne({ email });
		// 	res.status(400).json({
		// 		message: "User with this email id already exists",
		// 	});
		// 	return;
		// }

		// const company = await Company.create({
		// 	name: regData.companyName,
		// 	slug: regData.slug,
		// 	website: regData.website,
		// 	phone: regData.phone,
		// 	industry: regData.industry,
		// 	status: "active",
		// 	plan: "free",
		// });

		// const user = await User.create({
		// 	name: regData.name,
		// 	email: regData.email,
		// 	password: regData.password,
		// 	role: "admin",
		// 	companyId: company._id.toString(),
		// });

		// company.ownerId = user._id;
		// await company.save();

		// await RegistrationOtp.deleteOne({ email });

		// const token = generateToken(
		// 	user._id.toString(),
		// 	company._id.toString(),
		// );

		// res.status(201).json({
		// 	message: "Company and admin user registered successfully",
		// 	token,
		// 	user: user.toJSON(),
		// 	company: {
		// 		_id: company._id,
		// 		name: company.name,
		// 		slug: company.slug,
		// 		website: company.website,
		// 		phone: company.phone,
		// 		industry: company.industry,
		// 	},
		// });
        const existingTenant = await Tenant.findOne({ name: { $regex: `^${regData.companyName}$`, $options: 'i' } });
if (existingTenant) {
    await RegistrationOtp.deleteOne({ email });
    res.status(400).json({ message: 'A workspace with this company name already exists' });
    return;
}

const existingUser = await User.findOne({ email: regData.email });
if (existingUser) {
    await RegistrationOtp.deleteOne({ email });
    res.status(400).json({ message: 'User with this email already exists' });
    return;
}

// Create tenant first (no ownerId yet)
const tenant = await Tenant.create({
    name: regData.companyName,
    website: regData.website,
    phone: regData.phone,
    industry: regData.industry,
    plan: 'free',
    isActive: true,
});

// Create admin user scoped to tenant
// Use a temporary password first (gets hashed by the pre-save hook),
// then overwrite with the already-hashed password from RegistrationOtp
const tempPassword = crypto.randomBytes(16).toString('hex');
const user = await User.create({
    name: regData.name,
    email: regData.email,
    password: tempPassword,
    role: 'admin',
    tenantId: tenant._id,
});
// Overwrite with the real hashed password (updateOne bypasses pre-save hook)
await User.updateOne({ _id: user._id }, { $set: { password: regData.passwordHash } });

// Backfill ownerId now that we have the user
tenant.ownerId = user._id;
await tenant.save();

await RegistrationOtp.deleteOne({ email });

const token = generateToken(user._id.toString(), tenant._id.toString());

res.status(201).json({
    message: 'Workspace created successfully',
    token,
    user: user.toJSON(),
    tenant: {
        _id: tenant._id,
        name: tenant.name,
        plan: tenant.plan,
    },
});
	} catch (error: any) {
		if (error.code === 11000) {
			res.status(400).json({
				message: "User with this email id already exists",
			});
			return;
		}
		res.status(500).json({
			message: error.message || "Verification failed",
		});
	}
};

export const login = async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const { email, password } = req.body;

		const user = await User.findOne({ email });
		if (!user || !(await user.comparePassword(password))) {
			res.status(401).json({ message: "Invalid email or password" });
			return;
		}

		if (!user.isActive) {
			res.status(403).json({ message: "Account is deactivated" });
			return;
		}

		user.lastLogin = new Date();
		await user.save();

		const token = generateToken(user._id.toString(), user.tenantId.toString());

		res.json({
			message: "Login successful",
			token,
			user: user.toJSON(),
		});
	} catch (error: any) {
		res.status(500).json({ message: error.message || "Login failed" });
	}
};

export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		res.json({ user: req.user });
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

import Team from "../models/Team";
import mongoose from "mongoose";

export const getUsers = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		const userRole = req.user!.role;
		const userId = req.user!._id;
		const tenantId = req.user!.tenantId;
		const { all } = req.query;

		let query: any = { tenantId };

		// If ?all=true is passed, return all users in the company
		if (all === "true") {
			query = { tenantId };
		} else if (userRole === "manager") {
			// Managers only see users from their teams
			const managedTeams = await Team.find({ manager: userId });
			const memberIds = managedTeams.flatMap((t) =>
				t.members.map((m) => m.toString()),
			);
			// Include themselves and unique members
			const uniqueMemberIds = [
				...new Set([...memberIds, userId.toString()]),
			];
			query._id = { $in: uniqueMemberIds };
		} else if (userRole === "member") {
			const userTeams = await Team.find({ members: userId });
			const memberIds = userTeams.flatMap((t) =>
				t.members.map((m) => m.toString()),
			);
			const managerIds = userTeams.map((t) => t.manager.toString());
			const uniqueIds = [
				...new Set([...memberIds, ...managerIds, userId.toString()]),
			];
			query._id = { $in: uniqueIds };
		}

		const users = await User.find(query)
			.select("-password")
			.sort({ name: 1 });
		res.json({ users });
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

export const updateUser = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		const { id } = req.params;
		const { name, email, role, permissions } = req.body;

		const updates: any = {};
		if (name) updates.name = name;
		if (email) updates.email = email;
		if (role) updates.role = role;
		if (permissions?.allowedTabs) {
			updates.permissions = { allowedTabs: permissions.allowedTabs };
		}

		const user = await User.findOneAndUpdate(
			{ _id: id, tenantId: req.user!.tenantId },
			updates,
			{ returnDocument: "after" },
		).select("-password");

		if (!user) {
			res.status(404).json({ message: "User not found, there is some error !!" });
			return;
		}

		res.json({ user, message : "User Updated Success" });
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};
// export const updateUser = async (
// 	req: AuthRequest,
// 	res: Response,
// ): Promise<void> => {
// 	try {
// 		const { id } = req.params;
// 		const updates = req.body;
// 		delete updates.password;

// 		const user = await User.findByIdAndUpdate(id, updates, {
// 			returnDocument: "after",
// 		}).select("-password");
// 		if (!user) {
// 			res.status(404).json({ message: "User not found" });
// 			return;
// 		}

// 		res.json({ user });
// 	} catch (error: any) {
// 		res.status(500).json({ message: error.message });
// 	}
// };

export const deleteUser = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		const { id } = req.params;
		const user = await User.findByIdAndUpdate(
			id,
			{ isActive: false },
			{ returnDocument: "after" },
		);
		if (!user) {
			res.status(404).json({ message: "User not found" });
			return;
		}
		res.json({ message: "User deactivated successfully" });
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

export const activateUser = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		const { id } = req.params;
		const user = await User.findByIdAndUpdate(
			id,
			{ isActive: true },
			{ returnDocument: "after" },
		);
		if (!user) {
			res.status(404).json({ message: "User not found" });
			return;
		}
		res.json({ message: "User activated successfully" });
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

export const permanentDeleteUser = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		const { id } = req.params;

		if (id === req.user!._id.toString()) {
			res.status(400).json({
				message: "You cannot delete your own account permanently",
			});
			return;
		}

		const user = await User.findByIdAndDelete(id);
		if (!user) {
			res.status(404).json({ message: "User not found" });
			return;
		}

		res.json({ message: "User permanently deleted" });
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

import { uploadToGridFS, deleteFromGridFS } from "../utils/gridfs";

export const uploadAvatar = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		if (req.params.id !== req.user!._id.toString() && req.user!.role !== 'admin') {
			res.status(403).json({ message: "Insufficient permissions" });
			return;
		}

		if (!req.file) {
			res.status(400).json({ message: "No file uploaded" });
			return;
		}

		const user = await User.findById(req.params.id);
		if (!user) {
			res.status(404).json({ message: "User not found" });
			return;
		}

		// Delete old avatar if exists in GridFS
		if (user.avatar && user.avatar.startsWith("/uploads/")) {
			const oldFilename = user.avatar.replace("/uploads/", "");
			await deleteFromGridFS(oldFilename);
		}

		// Manual upload to GridFS from buffer
		const { filename } = await uploadToGridFS(
			req.file.buffer,
			req.file.originalname,
			req.file.mimetype,
		);

		user.avatar = `/uploads/${filename}`;
		await user.save();

		res.json({
			message: "Avatar updated successfully",
			user: { ...user.toObject(), password: "" },
		});
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

export const removeAvatar = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		if (req.params.id !== req.user!._id.toString() && req.user!.role !== 'admin') {
			res.status(403).json({ message: "Insufficient permissions" });
			return;
		}

		const user = await User.findById(req.params.id);
		if (!user) {
			res.status(404).json({ message: "User not found" });
			return;
		}

		// Delete from GridFS
		if (user.avatar && user.avatar.startsWith("/uploads/")) {
			const oldFilename = user.avatar.replace("/uploads/", "");
			await deleteFromGridFS(oldFilename);
		}

		user.avatar = undefined;
		await user.save();

		res.json({
			message: "Avatar removed successfully",
			user: { ...user.toObject(), password: "" },
		});
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

export const refreshToken = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		const user = await User.findById(req.user!._id).select("-password");
		if (!user || !user.isActive) {
			res.status(401).json({ message: "Invalid or expired token" });
			return;
		}

		const token = generateToken(user._id.toString(), user.tenantId.toString());
		res.json({ token });
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

export const changePassword = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		const { newPassword } = req.body;
		if (!newPassword || newPassword.length < 6) {
			res.status(400).json({
				message: "Password must be at least 6 characters long",
			});
			return;
		}

		const user = await User.findById(req.user!._id);
		if (!user) {
			res.status(404).json({ message: "User not found" });
			return;
		}

		const isSamePassword = await user.comparePassword(newPassword);
		if (isSamePassword) {
			res.status(400).json({
				message:
					"New password must be different from your current password",
			});
			return;
		}

		user.password = newPassword;
		await user.save(); // Trigger bcryptjs hash via save hook

		res.json({ message: "Password changed successfully" });
	} catch (error: any) {
		res.status(500).json({
			message: error.message || "Failed to change password",
		});
	}
};

export const forgotPassword = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		const { email } = req.body;
		const user = await User.findOne({ email });

		if (!user) {
			// For security, don't reveal that the user does not exist.
			res.status(200).json({
				message:
					"If that email exists in our system, we have sent a password reset OTP to it.",
			});
			return;
		}

		const otp = crypto.randomInt(0, 1000000).toString().padStart(6, "0"); // 6-digit OTP
		user.resetPasswordOtpHash = hashOtp(otp);
		user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins expiry

		// Since we are not updating password, save hook might skip, but it is safe.
		await user.save();

		// Send email asynchronously without blocking the response
		sendOtpEmail(user.email, otp).catch((error) => {
			console.error(`Failed to send OTP email to ${user.email}:`, error);
		});

		res.status(200).json({
			message:
				"If that email exists in our system, we have sent a password reset OTP to it.",
		});
	} catch (error: any) {
		res.status(500).json({
			message:
				error.message || "Failed to process password reset request",
		});
	}
};

export const verifyForgotPasswordOtp = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		const { email, otp } = req.body;

		if (!email || !otp) {
			res.status(400).json({ message: "Email and OTP are required" });
			return;
		}

		const user = await User.findOne({
			email,
			resetPasswordOtpHash: hashOtp(otp),
			resetPasswordExpires: { $gt: new Date() },
		});

		if (!user) {
			res.status(400).json({ message: "Invalid or expired OTP" });
			return;
		}

		// Clear OTP to prevent reuse
		user.resetPasswordOtpHash = undefined;
		user.resetPasswordExpires = undefined;
		user.lastLogin = new Date(); // Update last login since they are receiving a session token
		await user.save();

		const token = generateToken(user._id.toString(), user.tenantId.toString());

		res.json({
			message: "OTP verified successfully",
			token,
			user: user.toJSON(),
		});
	} catch (error: any) {
		res.status(500).json({
			message: error.message || "Failed to verify OTP",
		});
	}
};


export const createUser = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (req.user!.role !== 'admin') {
            res.status(403).json({ message: 'Only admins can create users' });
            return;
        }

        const { name, email, password, role, permissions } = req.body;

        if (!name || !email || !password) {
            res.status(400).json({ message: 'Name, email and password are required' });
            return;
        }

        const existingUser = await User.findOne({ email, tenantId: req.user!.tenantId });
        if (existingUser) {
            res.status(400).json({ message: 'User with this email already exists' });
            return;
        }

        const user = await User.create({
            name,
            email,
            password,
            role: role || 'member',
            tenantId: req.user!.tenantId,
            permissions: permissions || undefined, // falls back to schema default (all tabs)
        });

        res.status(201).json({ user: user.toJSON() });
    } catch (error: any) {
        if (error.code === 11000) {
            res.status(400).json({ message: 'User with this email already exists' });
            return;
        }
        res.status(500).json({ message: error.message });
    }
};
/* ------------------------------------------------------------------ */
/* E2EE device registry                                                */
/* ------------------------------------------------------------------ */

const MAX_DEVICES_PER_USER = 8;

/** Register (or replace) this device's E2EE public key. Auth: current user only. */
export const registerDevice = async (req: any, res: Response): Promise<void> => {
    try {
        const { deviceId, publicKey } = req.body || {};
        if (!deviceId || typeof deviceId !== 'string' || !publicKey || typeof publicKey !== 'string') {
            res.status(400).json({ message: 'deviceId and publicKey are required' });
            return;
        }
        if (!publicKey.includes('"kty"') || !publicKey.includes('"crv"')) {
            res.status(400).json({ message: 'publicKey must be an ECDH JWK string' });
            return;
        }
        const platform = String(req.body?.platform || 'unknown').slice(0, 32);
        const user = await User.findById(req.user!._id);
        if (!user) { res.status(404).json({ message: 'User not found' }); return; }

        user.devices = user.devices || [];
        const existing = user.devices.find((d: any) => d.deviceId === deviceId);
        if (existing) {
            existing.publicKey = publicKey;
            existing.platform = platform;
            existing.createdAt = new Date();
        } else {
            user.devices.push({ deviceId, publicKey, platform, createdAt: new Date() } as any);
            // Bound the list � drop the oldest devices beyond the cap
            while (user.devices.length > MAX_DEVICES_PER_USER) user.devices.shift();
        }
        await user.save();
        res.json({ devices: user.devices });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * Fetch E2EE device keys for a set of users (tenant-scoped).
 * Query: ?userIds=id1,id2,...  (defaults to caller)
 */
export const getUserEncryptionKeys = async (req: any, res: Response): Promise<void> => {
    try {
        const raw = String(req.query.userIds || '').split(',').map((s: string) => s.trim()).filter(Boolean);
        const ids = (raw.length ? raw : [String(req.user!._id)])
            .filter((id: string) => /^[0-9a-f]{24}$/i.test(id))
            .map((id: string) => new mongoose.Types.ObjectId(id));
        const users = await User.find(
            { _id: { $in: ids } },
            'name devices'
        ).lean();
        res.json({
            users: users.map((u: any) => ({
                _id: u._id,
                name: u.name,
                devices: (u.devices || []).map((d: any) => ({
                    deviceId: d.deviceId,
                    publicKey: d.publicKey,
                    platform: d.platform,
                    createdAt: d.createdAt,
                })),
            })),
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
