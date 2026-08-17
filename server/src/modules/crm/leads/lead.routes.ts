import { Router } from 'express';
import {
    getLeads, getLead, createLead, updateLead, deleteLead,
    addNote, recordCall, importExcel, downloadSampleExcel,
    getUpcomingFollowups, updateMeetingStatus, getLeadCounts, getLeadStats,
    getLeadFilterOptions,
} from './lead.controller';
import { authenticate, authorize } from '../../../shared/middlewares/auth.middleware';
import { upload } from '../../../shared/middlewares/upload.middleware';

const router = Router();

// Sample template — no auth needed (public dummy data)
router.get('/import/sample', downloadSampleExcel);

router.use(authenticate);

// Specific routes before parameterized routes
router.post('/import/excel', upload.single('file'), importExcel);
router.get('/upcoming', getUpcomingFollowups);

router.get('/stats', getLeadStats);
router.get('/counts', getLeadCounts);
router.get('/filter-options', getLeadFilterOptions);
router.get('/', getLeads);
router.get('/:id', getLead);
router.post('/', createLead);
router.put('/:id', updateLead);
router.delete('/:id', authorize('admin'), deleteLead);
router.post('/:id/notes',  addNote);
router.post('/:id/call', recordCall);
router.patch('/:id/meeting-status', updateMeetingStatus);

export default router;
