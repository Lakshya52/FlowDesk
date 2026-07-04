import { Response } from "express";
import { AuthRequest } from "../middlewares/auth";
export declare const createAssignment: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getAssignments: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getAssignment: (req: AuthRequest, res: Response) => Promise<void>;
export declare const updateAssignment: (req: AuthRequest, res: Response) => Promise<void>;
export declare const deleteAssignment: (req: AuthRequest, res: Response) => Promise<void>;
export declare const updateAssignmentCanvas: (req: AuthRequest, res: Response) => Promise<void>;
export declare const downloadSampleAssignmentsExcel: (_req: AuthRequest, res: Response) => Promise<void>;
export declare const previewImportAssignments: (req: AuthRequest, res: Response) => Promise<void>;
export declare const importAssignmentsExcel: (req: AuthRequest, res: Response) => Promise<void>;
//# sourceMappingURL=assignmentController.d.ts.map