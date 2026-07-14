import { Router } from 'express';
import {
    createFieldVisit,
    getFieldVisits,
    getFieldVisit,
    updateFieldVisit,
    cancelFieldVisit,
    checkIn,
    checkOut,
    addRemarks,
    recordLocation,
    getLocationTrack,
    getActiveVisits,
    getActiveVisitLocations,
    addExpense,
    removeExpense,
    getVisitReports,
    optimizeRoute,
    approveVisit,
    rejectVisit,
} from '../controllers/fieldVisitController';
import { authenticate, authorize } from '../middlewares/auth';
import { upload } from '../middlewares/upload';

const router = Router();

router.use(authenticate);

router.get('/active', getActiveVisits);
router.get('/active/locations', authorize('admin', 'manager'), getActiveVisitLocations);
router.get('/reports', authorize('admin', 'manager'), getVisitReports);
router.post('/optimize-route', authorize('admin', 'manager'), optimizeRoute);

router.get('/', getFieldVisits);
router.post('/', createFieldVisit);

router.get('/:id', getFieldVisit);
router.put('/:id', updateFieldVisit);
router.delete('/:id', cancelFieldVisit);

router.post('/:id/check-in', upload.single('selfie'), checkIn);
router.post('/:id/check-out', upload.single('selfie'), checkOut);
router.post('/:id/remarks', addRemarks);
router.post('/:id/location', recordLocation);
router.get('/:id/location', authorize('admin', 'manager'), getLocationTrack);

router.post('/:id/expenses', upload.single('receipt'), addExpense);
router.delete('/:id/expenses/:expenseId', removeExpense);

router.put('/:id/approve', authorize('admin', 'manager'), approveVisit);
router.put('/:id/reject', authorize('admin', 'manager'), rejectVisit);

export default router;
