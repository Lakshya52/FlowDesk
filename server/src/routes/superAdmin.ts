import { Router } from "express";
import { authenticate, authorize } from "../middlewares/auth";
import {
  getOverview,
  getTenants,
  getBlueprints,
  getActivity,
} from "../controllers/superAdminController";

const router = Router();

router.use(authenticate);
router.use(authorize("super_admin"));

router.get("/overview", getOverview);
router.get("/tenants", getTenants);
router.get("/blueprints", getBlueprints);
router.get("/activity", getActivity);

export default router;
