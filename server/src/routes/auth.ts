import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { register, login, getMe, getUsers, permanentDeleteUser, deleteUser, activateUser, updateUser, uploadAvatar, removeAvatar, changePassword, forgotPassword, verifyForgotPasswordOtp, verifyRegistrationOtp, resendRegistrationOtp, createUser } from '../controllers/authController';
import { authenticate, authorize } from '../middlewares/auth';
import { upload } from '../middlewares/upload';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: 'Too many attempts, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/register', authLimiter, register);
router.post('/verify-registration-otp', authLimiter, verifyRegistrationOtp);
router.post('/resend-registration-otp', authLimiter, resendRegistrationOtp);
router.post('/login', authLimiter, login);   
router.get('/me', authenticate, getMe);
router.get('/users', authenticate, getUsers);
router.post('/users/create', authenticate, createUser);
router.put('/users/:id', authenticate, authorize('admin'), updateUser);
router.delete('/users/:id', authenticate, authorize('admin'), deleteUser);
router.put('/users/:id/activate', authenticate, authorize('admin'), activateUser);
router.put('/users/:id/avatar', authenticate, upload.single('avatar'), uploadAvatar);
router.delete('/users/:id/avatar', authenticate, removeAvatar);
router.delete('/users/:id/permanent', authenticate, authorize('admin', 'manager'), permanentDeleteUser);
router.put('/change-password', authenticate, changePassword);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/verify-forgot-password-otp', authLimiter, verifyForgotPasswordOtp);

// Temporary debug route to check SMTP connectivity
// router.get('/debug-email', async (req, res) => {
//     const net = require('net');

//     const checkPort = (port: number) => new Promise((resolve) => {
//         const socket = new net.Socket();
//         socket.setTimeout(5000);
//         socket.connect(port, 'smtp.gmail.com', () => {
//             socket.destroy();
//             resolve(`✅ Port ${port} OPEN`);
//         });
//         socket.on('timeout', () => { socket.destroy(); resolve(`❌ Port ${port} TIMED OUT`); });
//         socket.on('error', (err: any) => { resolve(`❌ Port ${port} BLOCKED - ${err.message}`); });
//     });

//     const [p587, p465] = await Promise.all([checkPort(587), checkPort(465)]);
//     res.json({ port587: p587, port465: p465 });
// });


export default router;
