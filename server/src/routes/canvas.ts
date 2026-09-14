import express from 'express';
import { getNotes, createNote, updateNote, deleteAllNotes, deleteNote, getStrokes, createStroke, deleteStroke, deleteAllStrokes, getTexts, createText, updateText, deleteText, deleteAllTexts } from '../controllers/canvasController';
import { authenticate } from '../middlewares/auth';

const router = express.Router();

router.use(authenticate); // All canvas routes require authentication

router.get('/', getNotes);
router.post('/', createNote);
// Stroke routes must stay above '/:id' routes, otherwise Express would
// match DELETE /strokes as DELETE /:id with id='strokes'.
router.get('/strokes', getStrokes);
router.post('/strokes', createStroke);
router.delete('/strokes', deleteAllStrokes);
router.delete('/strokes/:id', deleteStroke);
// Text routes stay above '/:id' for the same reason as strokes.
router.get('/texts', getTexts);
router.post('/texts', createText);
router.put('/texts/:id', updateText);
router.delete('/texts', deleteAllTexts);
router.delete('/texts/:id', deleteText);
router.put('/:id', updateNote);
router.delete('/', deleteAllNotes);
router.delete('/:id', deleteNote);

export default router;
