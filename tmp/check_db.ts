import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Assignment from './server/src/models/Assignment';
import User from './server/src/models/User';

dotenv.config({ path: './server/.env' });

const check = async () => {
    try {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            console.error('FATAL: MONGODB_URI environment variable is not set');
            process.exit(1);
        }
        await mongoose.connect(mongoUri);
        console.log('Connected');

        const assignmentId = '69a6c0adc6e748b9dd8f633c'; // From browser state
        const assignment = await Assignment.findById(assignmentId);
        console.log('Assignment:', assignment ? assignment.title : 'Not found');

        const admin = await User.findOne({ email: 'admin@flowdesk.com' });
        console.log('Admin:', admin ? admin.role : 'Not found');

        await mongoose.disconnect();
    } catch (e) {
        console.error(e);
    }
};

check();
