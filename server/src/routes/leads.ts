import { Router } from 'express';
import {
    getLeads, getLead, createLead, updateLead, deleteLead,
    addNote, recordCall, importExcel, downloadSampleExcel,
    getUpcomingFollowups, updateMeetingStatus, getLeadCounts, getLeadStats,
} from '../controllers/leadController';
import { authenticate, authorize } from '../middlewares/auth';
import { upload } from '../middlewares/upload';

const router = Router();

// Sample template — no auth needed (public dummy data)
router.get('/import/sample', downloadSampleExcel);

router.use(authenticate);

// Specific routes before parameterized routes
router.post('/import/excel', upload.single('file'), importExcel);
router.get('/upcoming', getUpcomingFollowups);

router.get('/stats', getLeadStats);
router.get('/counts', getLeadCounts);
router.get('/', getLeads);
router.get('/:id', getLead);
router.post('/', createLead);
router.put('/:id', updateLead);
router.delete('/:id', authorize('admin'), deleteLead);
router.post('/:id/notes',  addNote);
router.post('/:id/call', recordCall);
router.patch('/:id/meeting-status', updateMeetingStatus);

export default router;
