import { Router } from 'express';
import {
    getLoanProducts,
    createLoanProduct,
    updateLoanProduct,
    deleteLoanProduct,
} from '../controllers/loanProductController';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

router.use(authenticate);

router.get('/', getLoanProducts);
router.post('/', authorize('admin', 'manager'), createLoanProduct);
router.put('/:id', authorize('admin', 'manager'), updateLoanProduct);
router.delete('/:id', authorize('admin', 'manager'), deleteLoanProduct);

export default router;
