import { Request, Response } from 'express';
import CanvasNote from '../models/CanvasNote';
import { getTenantUserIds } from '../utils/tenant';
// import { getTenantUserIds } from '../utils/tenant';

export const getNotes = async (req: Request, res: Response) =>  //
{
  try {
    // const tenantUserIds = await getTenantUserIds((req as any).user);
    // const notes = await CanvasNote.find({ userId: { $in: tenantUserIds } });
    
    // Personal canvas notes are private per user, not collaborative — no tenant-wide scope needed.
    const notes = await CanvasNote.find({ userId: (req as any).user._id });
    res.json(notes);
    
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const createNote = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { x, y, width, height, content, color, connections, title } = req.body;
    const note = await CanvasNote.create({
      userId,
      x,
      y,
      width,
      height,
      content,
      color,
      title: title || '',
      connections: connections || [],
    });
    res.status(201).json(note);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateNote = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { id } = req.params;
    const { x, y, width, height, content, color, connections, title } = req.body;

    // Partial update: only set the fields that were explicitly provided so that
    // unrelated fields (e.g. connections) are never accidentally wiped out.
    const updates: Record<string, unknown> = {};
    if (x !== undefined) updates.x = x;
    if (y !== undefined) updates.y = y;
    if (width !== undefined) updates.width = width;
    if (height !== undefined) updates.height = height;
    if (content !== undefined) updates.content = content;
    if (color !== undefined) updates.color = color;
    if (connections !== undefined) updates.connections = connections;
    if (title !== undefined) updates.title = title;

    const note = await CanvasNote.findOneAndUpdate(
      { _id: id, userId },
      { $set: updates },
      { new: true }
    );

    if (!note) return res.status(404).json({ message: 'Note not found' });
    res.json(note);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteNote = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { id } = req.params;

    const note = await CanvasNote.findOneAndDelete({ _id: id, userId });
    if (!note) return res.status(404).json({ message: 'Note not found' });

    // Clean up: remove references to the deleted note from all other notes.
    await CanvasNote.updateMany(
      { userId, connections: id },
      { $pull: { connections: id } }
    );

    res.json({ message: 'Note deleted' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
