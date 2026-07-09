import { Router } from 'express';
import { createTeam, getTeams, getTeam, updateTeam, deleteTeam, updateTeamMembers, requestJoinTeam, approveJoinRequest, rejectJoinRequest } from '../controllers/teamController';
import { authenticate, authorize } from '../middlewares/auth';
import Team from '../models/Team';
import User from '../models/User';

const router = Router();

router.use(authenticate);

router.post('/', authorize('admin'), createTeam);
router.get('/', getTeams);
router.get('/:id', getTeam);
router.put('/:id', authorize('admin', 'manager'), updateTeam);
router.delete('/:id', authorize('admin'), deleteTeam);
router.put('/:id/members', authorize('admin', 'manager'), updateTeamMembers);
router.post('/:id/request-join', requestJoinTeam);
router.post('/:id/requests/:userId/approve', authorize('admin', 'manager'), approveJoinRequest);
router.post('/:id/requests/:userId/reject', authorize('admin', 'manager'), rejectJoinRequest);
// server/src/routes/teams.ts

// Assign or remove a team manager — admin only
router.put('/:id/manager', authorize('admin'), async (req, res) => {
    try {
        const { managerId } = req.body; // null = remove manager

        const team = await Team.findById(req.params.id);
        if (!team) { res.status(404).json({ message: 'Team not found' }); return; }

        if (managerId) {
            const managerUser = await User.findById(managerId);
            if (!managerUser) { res.status(404).json({ message: 'User not found' }); return; }
            if (managerUser.role !== 'manager' && managerUser.role !== 'admin') {
                res.status(400).json({ message: 'User must have the Manager or Admin role' });
                return;
            }
            team.manager = managerId;
        } else {
            team.manager = undefined as any;
        }

        await team.save();

        const populated = await Team.findById(team._id)
            .populate('members', 'name email avatar role')
            .populate('manager',  'name email avatar')
            .populate('joinRequests', 'name email avatar');

        res.json({ team: populated });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
    