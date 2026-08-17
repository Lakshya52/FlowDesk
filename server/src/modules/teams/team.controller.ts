import { Response } from 'express';
import Team from './team.model';
import ActivityLog, { EntityType } from '../activityLogs/activityLog.model';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import { getTenantId } from '../../shared/utils/tenant';

export const createTeam = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user);
        const { members, manager, ...rest } = req.body;

        if (!members || !Array.isArray(members) || members.length === 0) {
            res.status(400).json({ message: 'At least one team member is required.' });
            return;
        }
        if (!manager) {
            res.status(400).json({ message: 'A team manager is required.' });
            return;
        }

        // Ensure the manager is not duplicated in the members array
        const cleanMembers = members.filter(
            (id: string) => id.toString() !== manager.toString(),
        );

        const team = await Team.create({
            ...rest,
            members: cleanMembers,
            manager,
            createdBy: req.user!._id,
            tenantId,
        });

        await ActivityLog.create({
            action: 'Team created',
            user: req.user!._id,
            entityType: EntityType.TEAM,
            entityId: team._id,
            metadata: { teamName: team.name },
        });

        const populated = await Team.findById(team._id)
            .populate('members', 'name email avatar role')
            .populate('createdBy', 'name email')
            .populate('manager', 'name email');

        res.status(201).json({ team: populated });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getTeams = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user);
        const { all } = req.query;

        let query: any = { tenantId };
        // If ?all=true is passed, return all teams for this tenant
        if (all !== 'true') {
            query.members = req.user!._id;
        }

        const teams = await Team.find(query)
            .populate('members', 'name email avatar role')
            .populate('createdBy', 'name email')
            .populate('manager', 'name email avatar')
            .populate('joinRequests', 'name email avatar role')
            .sort({ createdAt: -1 });

        res.json({ teams });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getTeam = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user);
        const team = await Team.findOne({ _id: req.params.id, tenantId })
            .populate('members', 'name email avatar role')
            .populate('createdBy', 'name email');

        if (!team) {
            res.status(404).json({ message: 'Team not found' });
            return;
        }

        res.json({ team });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const updateTeam = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user);
        const team = await Team.findOne({ _id: req.params.id, tenantId });
        if (!team) {
            res.status(404).json({ message: 'Team not found' });
            return;
        }

        // Only allow specific fields to prevent NoSQL injection
        const allowedFields = ['name', 'description', 'manager'];
        const updateData: Record<string, any> = {};
        for (const field of allowedFields) {
          if (field in req.body) updateData[field] = req.body[field];
        }

        const updated = await Team.findOneAndUpdate({ _id: req.params.id, tenantId }, updateData, { returnDocument: 'after' })
            .populate('members', 'name email avatar role')
            .populate('createdBy', 'name email');

        await ActivityLog.create({
            action: 'Team updated',
            user: req.user!._id,
            entityType: EntityType.TEAM,
            entityId: team._id,
            metadata: { teamName: team.name, updates: Object.keys(req.body) },
        });

        res.json({ team: updated });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const deleteTeam = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user);
        const team = await Team.findOne({ _id: req.params.id, tenantId });
        if (!team) {
            res.status(404).json({ message: 'Team not found' });
            return;
        }

		await team.deleteOne();

        await ActivityLog.create({
            action: 'Team deleted',
            user: req.user!._id,
            entityType: EntityType.TEAM,
            entityId: team._id,
            metadata: { teamName: team.name },
        });

        res.json({ message: 'Team deleted successfully' });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const updateTeamMembers = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user);
        const team = await Team.findOne({ _id: req.params.id, tenantId });
        if (!team) {
            res.status(404).json({ message: 'Team not found' });
            return;
        }

        // Everyone can update team members
        const { members } = req.body;
        team.members = members;
        await team.save();

        const populated = await Team.findById(team._id)
            .populate('members', 'name email avatar role')
            .populate('createdBy', 'name email')
            .populate('manager', 'name email avatar')
            .populate('joinRequests', 'name email avatar role');

        await ActivityLog.create({
            action: 'Team members updated',
            user: req.user!._id,
            entityType: EntityType.TEAM,
            entityId: team._id,
            metadata: { teamName: team.name, memberCount: members.length },
        });

        res.json({ team: populated });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const requestJoinTeam = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user);
        const team = await Team.findOne({ _id: req.params.id, tenantId });
        if (!team) {
            res.status(404).json({ message: 'Team not found' });
            return;
        }

        if (team.members.includes(req.user!._id)) {
            res.status(400).json({ message: 'Already a member of this team' });
            return;
        }

        if (team.joinRequests.includes(req.user!._id)) {
            res.status(400).json({ message: 'Join request already sent' });
            return;
        }

        team.joinRequests.push(req.user!._id);
        await team.save();

        const populated = await Team.findById(team._id)
            .populate('members', 'name email avatar role')
            .populate('joinRequests', 'name email avatar role')
            .populate('createdBy', 'name email');

        res.json({ team: populated, message: 'Join request sent successfully.' });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const approveJoinRequest = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user);
        const team = await Team.findOne({ _id: req.params.id, tenantId });
        if (!team) {
            res.status(404).json({ message: 'Team not found' });
            return;
        }

        // Everyone can approve join requests
        const userId = req.params.userId;
        const requestIndex = team.joinRequests.findIndex(id => id.toString() === userId);

        if (requestIndex === -1) {
            res.status(400).json({ message: 'Join request not found' });
            return;
        }

        team.joinRequests.splice(requestIndex, 1);
        if (!team.members.find(id => id.toString() === userId)) {
            //@ts-ignore
            team.members.push(userId);
        }
        await team.save();

        const populated = await Team.findById(team._id)
            .populate('members', 'name email avatar role')
            .populate('joinRequests', 'name email avatar role')
            .populate('createdBy', 'name email');

        res.json({ team: populated, message: 'Request approved.' });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const rejectJoinRequest = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user);
        const team = await Team.findOne({ _id: req.params.id, tenantId });
        if (!team) {
            res.status(404).json({ message: 'Team not found' });
            return;
        }

        // Everyone can reject join requests
        const userId = req.params.userId;
        const requestIndex = team.joinRequests.findIndex(id => id.toString() === userId);

        if (requestIndex === -1) {
            res.status(400).json({ message: 'Join request not found' });
            return;
        }

        team.joinRequests.splice(requestIndex, 1);
        await team.save();

        const populated = await Team.findById(team._id)
            .populate('members', 'name email avatar role')
            .populate('joinRequests', 'name email avatar role')
            .populate('createdBy', 'name email');

        res.json({ team: populated, message: 'Request rejected.' });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
