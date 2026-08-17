import express from "express";
import {
  getCalendars,
  createCalendar,
  updateCalendar,
  deleteCalendar,
  archiveCalendar,
  shareCalendar,
  removeShare,
  acceptShare,
  rejectShare,
} from "./calendar.controller";
import { authenticate } from '../../shared/middlewares/auth.middleware';

const router = express.Router();

router.use(authenticate);

router.get("/", getCalendars);
router.post("/", createCalendar);
router.put("/:id", updateCalendar);
router.delete("/:id", deleteCalendar);
router.put("/:id/archive", archiveCalendar);
router.post("/:id/share", shareCalendar);
router.delete("/:id/share/:userId", removeShare);
router.put("/:id/share/accept", acceptShare);
router.put("/:id/share/reject", rejectShare);

export default router;
