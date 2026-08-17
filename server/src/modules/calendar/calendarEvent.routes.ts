import express from 'express';
import {
  getEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  moveEvent,
  searchEvents
} from './calendarEvent.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';

const router = express.Router();

router.use(authenticate);

router.get('/search', searchEvents);
router.get('/:id', getEventById);
router.get('/', getEvents);
router.post('/', createEvent);
router.put('/:id', updateEvent);
router.delete('/:id', deleteEvent);
router.put('/:id/move', moveEvent);

export default router;
