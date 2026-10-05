import { Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import Calendar from "../models/Calendar";
import CalendarEvent from "../models/CalendarEvent";
import User from "../models/User";
import Notification from "../models/Notification";
import { getTenantId } from "../utils/tenant";
import {
  emitCalendarCreated,
  emitCalendarUpdated,
  emitCalendarDeleted,
} from "../services/calendarSocketService";

export const getCalendars = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;

    let calendars = await Calendar.find({
      $or: [
        { owner: userId },
        { "sharedWith": { $elemMatch: { user: userId, status: { $in: ["accepted", "pending"] } } } },
      ],
    })
      .populate("sharedWith.user", "name email avatar")
      .populate("owner", "name email avatar");

    // Clean up duplicate default calendars from previous bug
    const defaultCalendars = await Calendar.find({
      owner: userId,
      isDefault: true,
    });
    if (defaultCalendars.length > 1) {
      const [keep, ...duplicates] = defaultCalendars;
      const duplicateIds = duplicates.map((d) => d._id);

      // Move events from duplicates to the kept one
      await CalendarEvent.updateMany(
        { calendar: { $in: duplicateIds } },
        { $set: { calendar: keep._id } },
      );

      // Delete duplicates
      await Calendar.deleteMany({ _id: { $in: duplicateIds } });

      // Re-fetch calendars after cleanup
      calendars = await Calendar.find({
        $or: [
          { owner: userId },
          { "sharedWith": { $elemMatch: { user: userId, status: { $in: ["accepted", "pending"] } } } },
          { isSystem: true },
        ],
      })
        .populate("sharedWith.user", "name email avatar")
        .populate("owner", "name email avatar");
    }

    res.json(calendars);
  } catch (error) {
    res.status(500).json({ message: "Error fetching calendars", error });
  }
};

export const createCalendar = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    const {
      name,
      description,
      color,
      icon,
      visibility,
      sharedWith,
      teamId,
      isSystem,
    } = req.body;

    // Only admins should create system calendars
    if (isSystem && req.user?.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Not authorized to create system calendars" });
    }

    const calendar = await Calendar.create({
      name,
      description,
      color,
      icon,
      owner: isSystem ? undefined : userId,
      visibility,
      sharedWith,
      teamId,
      isSystem: isSystem || false,
    });

    try {
      emitCalendarCreated(getTenantId(req.user!), calendar);
    } catch {}

    res.status(201).json(calendar);
  } catch (error) {
    res.status(500).json({ message: "Error creating calendar", error });
  }
};

export const updateCalendar = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id;

    const calendar = await Calendar.findById(id);
    if (!calendar)
      return res.status(404).json({ message: "Calendar not found" });

    // Check permissions
    const isOwner = calendar.owner?.toString() === userId?.toString();
    const isEditor = calendar.sharedWith.some(
      (s) =>
        s.user.toString() === userId?.toString() && s.permission === "editor",
    );
    const isAdmin = req.user?.role === "admin";

    if (!isOwner && !isEditor && !(calendar.isSystem && isAdmin)) {
      return res
        .status(403)
        .json({ message: "Not authorized to update this calendar" });
    }

    const updatedCalendar = await Calendar.findByIdAndUpdate(
      id,
      { $set: req.body },
      { new: true },
    )
      .populate("sharedWith.user", "name email avatar")
      .populate("owner", "name email avatar");

    try {
      emitCalendarUpdated(getTenantId(req.user!), updatedCalendar);
    } catch {}

    res.json(updatedCalendar);
  } catch (error) {
    res.status(500).json({ message: "Error updating calendar", error });
  }
};

export const deleteCalendar = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id;

    const calendar = await Calendar.findById(id);
    if (!calendar)
      return res.status(404).json({ message: "Calendar not found" });

    const isOwner = calendar.owner?.toString() === userId?.toString();
    const isAdmin = req.user?.role === "admin";

    if (!isOwner && !(calendar.isSystem && isAdmin)) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this calendar" });
    }

    await CalendarEvent.deleteMany({ calendar: id });
    await Calendar.findByIdAndDelete(id);

    try {
      emitCalendarDeleted(getTenantId(req.user!), id as string);
    } catch {}

    res.json({ message: "Calendar deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting calendar", error });
  }
};

export const archiveCalendar = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const calendar = await Calendar.findByIdAndUpdate(
      id,
      { $set: { isArchived: req.body.isArchived } },
      { new: true },
    );
    try {
      emitCalendarUpdated(getTenantId(req.user!), calendar);
    } catch {}
    res.json(calendar);
  } catch (error) {
    res.status(500).json({ message: "Error archiving calendar", error });
  }
};

export const shareCalendar = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { userId, permission } = req.body;

    const calendar = await Calendar.findById(id);
    if (!calendar)
      return res.status(404).json({ message: "Calendar not found" });

    if (calendar.owner?.toString() !== req.user?._id?.toString()) {
      return res.status(403).json({ message: "Only owner can share calendar" });
    }

    // Check if already shared
    const existingShare = calendar.sharedWith.find(
      (s) => s.user.toString() === userId,
    );
    if (existingShare) {
      existingShare.permission = permission;
      existingShare.status = "pending";
    } else {
      calendar.sharedWith.push({ user: userId, permission, status: "pending" } as any);
    }

    await calendar.save();

    try {
      emitCalendarUpdated(getTenantId(req.user!), calendar);
    } catch {}

    await Notification.create({
      user: userId,
      type: "calendar_shared",
      title: "Calendar Shared",
      message: `${req.user?.name || "A user"} shared the calendar "${calendar.name}" with you`,
      link: "/calendar",
      metadata: { calendarId: calendar._id.toString() }
    });

    res.json(calendar);
  } catch (error) {
    res.status(500).json({ message: "Error sharing calendar", error });
  }
};

export const removeShare = async (req: AuthRequest, res: Response) => {
  try {
    const { id, userId } = req.params;
    const calendar = await Calendar.findById(id);

    if (!calendar)
      return res.status(404).json({ message: "Calendar not found" });

    if (calendar.owner?.toString() !== req.user?._id?.toString()) {
      return res.status(403).json({ message: "Only owner can modify shares" });
    }

    calendar.sharedWith = calendar.sharedWith.filter(
      (s) => s.user.toString() !== userId,
    );
    await calendar.save();

    try {
      emitCalendarUpdated(getTenantId(req.user!), calendar);
    } catch {}

    res.json(calendar);
  } catch (error) {
    res.status(500).json({ message: "Error removing share", error });
  }
};

export const acceptShare = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id;

    const calendar = await Calendar.findById(id);
    if (!calendar) return res.status(404).json({ message: "Calendar not found" });

    const share = calendar.sharedWith.find((s) => s.user.toString() === userId?.toString());
    if (!share) return res.status(404).json({ message: "Share invite not found" });

    share.status = 'accepted';
    await calendar.save();
    try {
      emitCalendarUpdated(getTenantId(req.user!), calendar);
    } catch {}
    res.json({ message: "Calendar share accepted" });
  } catch (error) {
    res.status(500).json({ message: "Error accepting calendar share", error });
  }
};

export const rejectShare = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id;

    const calendar = await Calendar.findById(id);
    if (!calendar) return res.status(404).json({ message: "Calendar not found" });

    calendar.sharedWith = calendar.sharedWith.filter((s) => s.user.toString() !== userId?.toString());
    await calendar.save();
    try {
      emitCalendarUpdated(getTenantId(req.user!), calendar);
    } catch {}
    res.json({ message: "Calendar share rejected" });
  } catch (error) {
    res.status(500).json({ message: "Error rejecting calendar share", error });
  }
};
