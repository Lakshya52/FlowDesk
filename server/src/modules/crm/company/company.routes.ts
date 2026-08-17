import { Router } from 'express';
import {
    createCompany,
    getCompanies,
    getCompany,
    updateCompany,
    deleteCompany,
    getCompanyContacts,
    createContact,
    updateContact,
    deleteContact,
    getCompanyProjects,
    importCompanies,
    exportCompaniesToExcel,
    exportCompaniesToPDF,
    downloadSampleExcel,
    sendBulkCompanyEmail,
    upload
} from './company.controller';
import { authenticate, authorize } from '../../../shared/middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// Import/Export routes (must come before /:id to avoid conflicts)
router.post('/import', authorize('admin', 'manager'), upload.single('file'), importCompanies);
router.get('/import/sample', downloadSampleExcel);
router.get('/export/excel', exportCompaniesToExcel);
router.get('/export/pdf', exportCompaniesToPDF);
router.post('/bulk-email', sendBulkCompanyEmail);

// Company routes
router.post('/', authorize('admin', 'manager'), createCompany);
router.get('/', getCompanies);
router.get('/:id', getCompany);
router.put('/:id', authorize('admin', 'manager'), updateCompany);
router.delete('/:id', authorize('admin'), deleteCompany);

// Contact routes
router.get('/:id/contacts', getCompanyContacts);
router.post('/:id/contacts', authorize('admin', 'manager'), createContact);
router.put('/:id/contacts/:contactId', authorize('admin', 'manager'), updateContact);
router.delete('/:id/contacts/:contactId', authorize('admin', 'manager'), deleteContact);

// Projects route (placeholder for future integration)
router.get('/:id/projects', getCompanyProjects);

export default router;
