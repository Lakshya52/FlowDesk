import { Response } from 'express';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import mongoose from 'mongoose';
import CalendarEvent from './calendarEvent.model';
import Calendar from './calendar.model';
import Task from '../tasks/task.model';
import Assignment from '../assignments/assignment.model';

export const getEventById = async (req: AuthRequest, res: Response) => {
  try {
    const event = await CalendarEvent.findById(req.params.id)
      .populate('calendar', 'name color isSystem')
      .populate('createdBy', 'name email avatar')
      .populate('attendees.user', 'name email avatar');

    if (!event) return res.status(404).json({ message: 'Event not found' });

    res.json(event);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching event', error });
  }
};

export const getEvents = async (req: AuthRequest, res: Response) => {
  try {
    const { start, end, calendars } = req.query;
    const userId = req.user?._id;

    const query: any = {};
    if (start && end) {
      query.startDate = { $lte: new Date(end as string) };
      query.endDate = { $gte: new Date(start as string) };
    }

    if (calendars) {
      query.calendar = { $in: (calendars as string).split(',') };
    } else {
      // Get user's visible calendars
      const userCalendars = await Calendar.find({
  $or: [
    { owner: userId },
    { 'sharedWith': { $elemMatch: { user: userId, status: 'accepted' } } },
  ]
});
      query.calendar = { $in: userCalendars.map(c => c._id) };
    }

    const events = await CalendarEvent.find(query)
      .populate('calendar', 'name color isSystem')
      .populate('createdBy', 'name email avatar')
      .populate('attendees.user', 'name email avatar');

    // Handle Task & Assignment Virtual Calendar Bridge if requested
    // If the frontend explicitly requests the virtual "tasks" calendar or doesn't filter
    const includeTasks = !calendars || (calendars as string).includes('virtual_tasks');
    
    if (includeTasks && start && end) {
      const tasks = await Task.find({
        $or: [{ assignedTo: userId }, { createdBy: userId }],
        dueDate: { $gte: new Date(start as string), $lte: new Date(end as string) }
      });

      const assignments = await Assignment.find({
        $or: [{ assignee: userId }, { createdBy: userId }],
        dueDate: { $gte: new Date(start as string), $lte: new Date(end as string) }
      });

      const virtualEvents = [
        ...tasks.map(t => ({
          _id: `task_${t._id}`,
          title: t.title,
          description: t.description,
          calendar: { _id: 'virtual_tasks', name: 'Tasks', color: '#10b981', isSystem: true }, // emerald-500
          eventType: 'task',
          startDate: t.dueDate,
          endDate: t.dueDate,
          allDay: true,
          priority: t.priority,
          status: t.status,
          linkedTask: t._id
        })),
        ...assignments.map(a => ({
          _id: `assignment_${a._id}`,
          title: a.title,
          description: a.description,
          calendar: { _id: 'virtual_tasks', name: 'Assignments', color: '#f59e0b', isSystem: true }, // amber-500
          eventType: 'task',
          startDate: a.dueDate,
          endDate: a.dueDate,
          allDay: true,
          status: a.status,
          linkedAssignment: a._id
        }))
      ];
      
      return res.json([...events, ...virtualEvents]);
    }

    res.json(events);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching events', error });
  }
};

export const createEvent = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    const { calendar: calendarId, ...eventData } = req.body;

    const calendar = await Calendar.findById(calendarId);
    if (!calendar) return res.status(404).json({ message: 'Calendar not found' });

    // Verify permission
    const isOwner = calendar.owner?.toString() === userId?.toString();
    const isEditor = calendar.sharedWith.some(s => s.user.toString() === userId?.toString() && s.permission === 'editor');
    const isAdmin = req.user?.role === 'admin';

    if (!isOwner && !isEditor && !(calendar.isSystem && isAdmin)) {
      return res.status(403).json({ message: 'Not authorized to add events to this calendar' });
    }

    const event = await CalendarEvent.create({
      ...eventData,
      calendar: calendarId,
      createdBy: userId
    });

    const populatedEvent = await CalendarEvent.findById(event._id)
      .populate('calendar', 'name color isSystem')
      .populate('createdBy', 'name email avatar')
      .populate('attendees.user', 'name email avatar');

    res.status(201).json(populatedEvent);
  } catch (error) {
    res.status(500).json({ message: 'Error creating event', error });
  }
};

export const updateEvent = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id;
    
    const event = await CalendarEvent.findById(id).populate('calendar');
    if (!event) return res.status(404).json({ message: 'Event not found' });

    const calendar: any = event.calendar;
    const isOwner = calendar.owner?.toString() === userId?.toString();
    const isEditor = calendar.sharedWith.some((s: any) => s.user.toString() === userId?.toString() && s.permission === 'editor');
    const isAdmin = req.user?.role === 'admin';

    if (!isOwner && !isEditor && !(calendar.isSystem && isAdmin)) {
      return res.status(403).json({ message: 'Not authorized to update this event' });
    }

    const updatedEvent = await CalendarEvent.findByIdAndUpdate(
      id,
      { $set: req.body },
      { new: true }
    ).populate('calendar', 'name color isSystem')
     .populate('createdBy', 'name email avatar')
     .populate('attendees.user', 'name email avatar');

    res.json(updatedEvent);
  } catch (error) {
    res.status(500).json({ message: 'Error updating event', error });
  }
};

export const deleteEvent = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id;
    
    const event = await CalendarEvent.findById(id).populate('calendar');
    if (!event) return res.status(404).json({ message: 'Event not found' });

    const calendar: any = event.calendar;
    const isOwner = calendar.owner?.toString() === userId?.toString();
    const isEditor = calendar.sharedWith.some((s: any) => s.user.toString() === userId?.toString() && s.permission === 'editor');
    const isAdmin = req.user?.role === 'admin';

    if (!isOwner && !isEditor && !(calendar.isSystem && isAdmin)) {
      return res.status(403).json({ message: 'Not authorized to delete this event' });
    }

    await CalendarEvent.findByIdAndDelete(id);

    // If recurring, might need to handle deleting future events too (skip for now to keep simple)
    
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting event', error });
  }
};

export const moveEvent = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { startDate, endDate, allDay } = req.body;
    
    const updatedEvent = await CalendarEvent.findByIdAndUpdate(
      id,
      { $set: { startDate, endDate, allDay } },
      { new: true }
    ).populate('calendar', 'name color isSystem');

    res.json(updatedEvent);
  } catch (error) {
    res.status(500).json({ message: 'Error moving event', error });
  }
};

export const searchEvents = async (req: AuthRequest, res: Response) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);

    const userId = req.user?._id;
    const userCalendars = await Calendar.find({
  $or: [
    { owner: userId },
    { 'sharedWith': { $elemMatch: { user: userId, status: 'accepted' } } },
  ]
});
    
    const calendarIds = userCalendars.map(c => c._id);

    const events = await CalendarEvent.find({
      calendar: { $in: calendarIds },
      $or: [
        { title: { $regex: q as string, $options: 'i' } },
        { description: { $regex: q as string, $options: 'i' } }
      ]
    }).populate('calendar', 'name color isSystem').limit(20);

    res.json(events);
  } catch (error) {
    res.status(500).json({ message: 'Error searching events', error });
  }
};
