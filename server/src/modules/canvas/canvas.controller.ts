import { Request, Response } from 'express';
import CanvasNote from './canvasNote.model';
import { getTenantUserIds } from '../../shared/utils/tenant';
// import { getTenantUserIds } from '../../shared/utils/tenant';

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
    const { x, y, width, height, content, color } = req.body;
    const note = await CanvasNote.create({
      userId,
      x,
      y,
      width,
      height,
      content,
      color,
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
    const { x, y, width, height, content, color } = req.body;

    const note = await CanvasNote.findOneAndUpdate(
      { _id: id, userId },
      { x, y, width, height, content, color },
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

    res.json({ message: 'Note deleted' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
