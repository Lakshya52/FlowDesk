"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const assignmentController_1 = require("../controllers/assignmentController");
const auth_1 = require("../middlewares/auth");
const upload_1 = require("../middlewares/upload");
const router = (0, express_1.Router)();
// Public route (no auth) — sample Excel download
router.get('/import/sample', assignmentController_1.downloadSampleAssignmentsExcel);
router.use(auth_1.authenticate);
router.post('/', (0, auth_1.authorize)('admin', 'manager', 'member'), assignmentController_1.createAssignment);
router.get('/', assignmentController_1.getAssignments);
router.get('/:id', assignmentController_1.getAssignment);
router.put('/:id', (0, auth_1.authorize)('admin', 'manager', 'member'), assignmentController_1.updateAssignment);
router.patch('/:id/canvas', assignmentController_1.updateAssignmentCanvas);
router.delete('/:id', (0, auth_1.authorize)('admin', 'manager', 'member'), assignmentController_1.deleteAssignment);
// Import routes (must be before generic /:id to avoid route conflict)
router.post('/import/preview', (0, auth_1.authorize)('admin', 'manager', 'member'), upload_1.upload.single('file'), assignmentController_1.previewImportAssignments);
router.post('/import/excel', (0, auth_1.authorize)('admin', 'manager', 'member'), upload_1.upload.single('file'), assignmentController_1.importAssignmentsExcel);
exports.default = router;
//# sourceMappingURL=assignments.js.map