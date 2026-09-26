import { Router } from 'express';
import { getReleases, downloadReleaseAsset } from '../controllers/releaseController';

// Public route — the releases/download page must work pre-login.
const router = Router();

// NOTE: register before '/' is irrelevant here (distinct paths), but the
// asset stream must stay above any future '/:param' route.
router.get('/assets/:assetId', downloadReleaseAsset);
router.get('/', getReleases);

export default router;
