import { Router } from 'express';
import { getReleases } from '../controllers/releaseController';

// Public route — the releases/download page must work pre-login.
const router = Router();

router.get('/', getReleases);

export default router;
