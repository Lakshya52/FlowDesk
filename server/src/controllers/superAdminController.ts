import { Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import {
  getOverviewStats,
  getTenantsList,
  getRecurringBlueprints,
  getRecentActivity,
} from "../services/superAdminStats";

export const getOverview = async (
  _req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const overview = await getOverviewStats();
    res.json({ success: true, ...overview });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getTenants = async (
  _req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const tenants = await getTenantsList();
    res.json({ success: true, tenants });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getBlueprints = async (
  _req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const blueprints = await getRecurringBlueprints();
    res.json({ success: true, blueprints });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getActivity = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const logs = await getRecentActivity(limit);
    res.json({ success: true, logs });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
