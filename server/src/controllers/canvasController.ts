import { Request, Response } from 'express';
import CanvasNote from '../models/CanvasNote';
import CanvasStroke from '../models/CanvasStroke';
import CanvasText from '../models/CanvasText';
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

export const deleteAllNotes = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;

    const result = await CanvasNote.deleteMany({ userId });

    res.json({ message: 'All notes deleted', deletedCount: result.deletedCount });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getStrokes = async (req: Request, res: Response) => {
  try {
    // Personal strokes are private per user, like canvas notes.
    const strokes = await CanvasStroke.find({ userId: (req as any).user._id });
    res.json(strokes);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

const MAX_STROKE_POINTS = 2000;

export const createStroke = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { points, color, width } = req.body;

    if (!Array.isArray(points) || points.length === 0 || points.length > MAX_STROKE_POINTS) {
      return res.status(400).json({ message: `Stroke must have 1-${MAX_STROKE_POINTS} points` });
    }
    for (const p of points) {
      if (typeof p?.x !== 'number' || typeof p?.y !== 'number' || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        return res.status(400).json({ message: 'Stroke points must be finite {x, y} numbers' });
      }
    }

    const stroke = await CanvasStroke.create({
      userId,
      points,
      color: typeof color === 'string' && color.length <= 20 ? color : '#6366f1',
      width: typeof width === 'number' && Number.isFinite(width) ? Math.min(Math.max(width, 1), 50) : 4,
    });
    res.status(201).json(stroke);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteStroke = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { id } = req.params;

    const stroke = await CanvasStroke.findOneAndDelete({ _id: id, userId });
    if (!stroke) return res.status(404).json({ message: 'Stroke not found' });

    res.json({ message: 'Stroke deleted' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteAllStrokes = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;

    const result = await CanvasStroke.deleteMany({ userId });

    res.json({ message: 'All strokes deleted', deletedCount: result.deletedCount });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getTexts = async (req: Request, res: Response) => {
  try {
    // Personal text boxes are private per user, like canvas notes.
    const texts = await CanvasText.find({ userId: (req as any).user._id });
    res.json(texts);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

const MAX_TEXT_LENGTH = 2000;

const sanitizeTextInput = (body: any) => {
  const out: Record<string, unknown> = {};
  if (body.x !== undefined) {
    if (typeof body.x !== 'number' || !Number.isFinite(body.x)) throw new Error('Invalid x');
    out.x = body.x;
  }
  if (body.y !== undefined) {
    if (typeof body.y !== 'number' || !Number.isFinite(body.y)) throw new Error('Invalid y');
    out.y = body.y;
  }
  if (body.width !== undefined) {
    if (typeof body.width !== 'number' || !Number.isFinite(body.width)) throw new Error('Invalid width');
    out.width = Math.min(Math.max(body.width, 80), 2000);
  }
  if (body.fontSize !== undefined) {
    if (typeof body.fontSize !== 'number' || !Number.isFinite(body.fontSize)) throw new Error('Invalid fontSize');
    out.fontSize = Math.min(Math.max(body.fontSize, 8), 120);
  }
  if (body.text !== undefined) {
    if (typeof body.text !== 'string') throw new Error('Invalid text');
    out.text = body.text.slice(0, MAX_TEXT_LENGTH);
  }
  if (body.align !== undefined) {
    if (!['left', 'center', 'right'].includes(body.align)) throw new Error('Invalid align');
    out.align = body.align;
  }
  return out;
};

export const createText = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { x, y } = req.body;
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
      return res.status(400).json({ message: 'Text requires finite x and y' });
    }
    const text = await CanvasText.create({
      userId,
      x,
      y,
      width: 240,
      text: '',
      ...sanitizeTextInput({ width: req.body.width, text: req.body.text, align: req.body.align }),
    });
    res.status(201).json(text);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const updateText = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { id } = req.params;

    let updates: Record<string, unknown>;
    try {
      updates = sanitizeTextInput(req.body);
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }

    const text = await CanvasText.findOneAndUpdate(
      { _id: id, userId },
      { $set: updates },
      { new: true }
    );

    if (!text) return res.status(404).json({ message: 'Text not found' });
    res.json(text);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteText = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { id } = req.params;

    const text = await CanvasText.findOneAndDelete({ _id: id, userId });
    if (!text) return res.status(404).json({ message: 'Text not found' });

    res.json({ message: 'Text deleted' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteAllTexts = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;

    const result = await CanvasText.deleteMany({ userId });

    res.json({ message: 'All texts deleted', deletedCount: result.deletedCount });
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
