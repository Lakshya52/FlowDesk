"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteNote = exports.updateNote = exports.createNote = exports.getNotes = void 0;
const CanvasNote_1 = __importDefault(require("../models/CanvasNote"));
const tenant_1 = require("../utils/tenant");
const getNotes = async (req, res) => {
    try {
        const tenantUserIds = await (0, tenant_1.getTenantUserIds)(req.user);
        const notes = await CanvasNote_1.default.find({ userId: { $in: tenantUserIds } });
        res.json(notes);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getNotes = getNotes;
const createNote = async (req, res) => {
    try {
        const userId = req.user._id;
        const { x, y, width, height, content, color } = req.body;
        const note = await CanvasNote_1.default.create({
            userId,
            x,
            y,
            width,
            height,
            content,
            color,
        });
        res.status(201).json(note);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.createNote = createNote;
const updateNote = async (req, res) => {
    try {
        const userId = req.user._id;
        const { id } = req.params;
        const { x, y, width, height, content, color } = req.body;
        const note = await CanvasNote_1.default.findOneAndUpdate({ _id: id, userId }, { x, y, width, height, content, color }, { new: true });
        if (!note)
            return res.status(404).json({ message: 'Note not found' });
        res.json(note);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateNote = updateNote;
const deleteNote = async (req, res) => {
    try {
        const userId = req.user._id;
        const { id } = req.params;
        const note = await CanvasNote_1.default.findOneAndDelete({ _id: id, userId });
        if (!note)
            return res.status(404).json({ message: 'Note not found' });
        res.json({ message: 'Note deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteNote = deleteNote;
//# sourceMappingURL=canvasController.js.map