import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import User, { IUser } from "../models/User";

export interface AuthRequest extends Request {
	user?: IUser;
}

export const authenticate = async (
	req: AuthRequest,
	res: Response,
	next: NextFunction,
): Promise<void> => {
	try {
		const authHeader = req.headers.authorization;
		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			res.status(401).json({ message: "Authentication required" });
			return;
		}

		const token = authHeader.split(" ")[1];

		const decoded = jwt.verify(
			token,
			process.env.JWT_SECRET!,
		) as { userId: string; tenantId: string };

		const user = await User.findById(decoded.userId)
			.select("-password")
			.populate("tenantId");
            
		if (!user || !user.isActive) {
			res.status(401).json({ message: "Invalid or expired token" });
			return;
		}

		req.user = user;
		next();
	} catch (error) {
		res.status(401).json({ message: "Invalid or expired token" });
	}
};

export const authorize = (...roles: string[]) => {
	return (req: AuthRequest, res: Response, next: NextFunction): void => {
		if (!req.user) {
			res.status(401).json({ message: "Authentication required" });
			return;
		}
		if (roles.length > 0 && !roles.includes(req.user.role as string)) {
			res.status(403).json({ message: "Insufficient permissions" });
			return;
		}
		next();
	};
};
