import { Response } from "express";
import Comment from "../models/Comment";
import { NotificationType } from "../models/Notification";
import ActivityLog, { EntityType } from "../models/ActivityLog";
import User from "../models/User";
import { AuthRequest } from "../middlewares/auth";
import { createNotifications } from "../services/notificationService";
import { getTenantUserIds } from "../utils/tenant";

export const createComment = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		const { content, assignmentId, taskId, mentions } = req.body;

		const comment = await Comment.create({
			content,
			author: req.user!._id,
			assignment: assignmentId,
			task: taskId,
			mentions: mentions || [],
		});

		// Notify mentioned users
		if (mentions && mentions.length > 0) {
			const payloads = mentions.map((m: any) => ({
				user: m.user,
				type: NotificationType.MENTION,
				title: "New Mention",
				message: `${req.user!.name} mentioned you in a comment`,
				link: taskId
					? `/assignments/${assignmentId}?taskId=${taskId}`
					: `/assignments/${assignmentId}`,
			}));
			await createNotifications(payloads);
		}

		await ActivityLog.create({
			action: "Comment added",
			user: req.user!._id,
			entityType: EntityType.COMMENT,
			entityId: comment._id,
			metadata: { assignmentId, taskId },
		});

		const populated = await Comment.findById(comment._id)
			.populate("author", "name email avatar")
			.populate("mentions.user", "name email");

		res.status(201).json({ comment: populated });
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

export const getComments = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		const { assignmentId, taskId } = req.query;
		const tenantUserIds = await getTenantUserIds(req.user);
		const filter: any = {};

		if (assignmentId) filter.assignment = assignmentId;
		if (taskId) filter.task = taskId;

		// Tenant scope: only show comments where author is in this tenant
		filter.author = { $in: tenantUserIds };

		const comments = await Comment.find(filter)
			.populate("author", "name email avatar")
			.populate("mentions.user", "name email")
			.sort({ createdAt: -1 });

		res.json({ comments });
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

export const deleteComment = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		const tenantUserIds = await getTenantUserIds(req.user);
		const comment = await Comment.findById(req.params.id);
		if (!comment) {
			res.status(404).json({ message: "Comment not found" });
			return;
		}

		// Tenant check
		if (!tenantUserIds.includes(comment.author.toString())) {
			res.status(403).json({ message: "Access denied" });
			return;
		}

		// Only author or admin can delete
		if (
			comment.author.toString() !== req.user!._id.toString() &&
			req.user!.role !== "admin"
		) {
			res.status(403).json({
				message: "Not authorized to delete this comment",
			});
			return;
		}

		await Comment.findByIdAndDelete(req.params.id);
		res.json({ message: "Comment deleted" });
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

export const searchUsers = async (
	req: AuthRequest,
	res: Response,
): Promise<void> => {
	try {
		const { q } = req.query;
		if (!q) {
			res.json({ users: [] });
			return;
		}

		// const users = await User.find({
		//     $or: [
		//         { name: { $regex: q, $options: 'i' } },
		//         { email: { $regex: q, $options: 'i' } },
		//     ],
		//     isActive: true,
		// } as any).select('name email avatar').limit(10);
		const users = await User.find({
			tenantId: req.user!.tenantId,
			$or: [
				{ name: { $regex: q, $options: "i" } },
				{ email: { $regex: q, $options: "i" } },
			],
			isActive: true,
		})
			.select("name email avatar")
			.limit(10);

		res.json({ users });
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};
