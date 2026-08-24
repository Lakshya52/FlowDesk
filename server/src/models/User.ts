import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export enum UserRole {
    ADMIN = 'admin',
    MANAGER = 'manager',
    MEMBER = 'member',
}

export interface IUserDevice {
    deviceId: string;
    /** ECDH P-256 public key in JWK (JSON) form — safe to expose. */
    publicKey: string;
    platform: string;
    createdAt: Date;
}

export interface IUser extends Document {
    name: string;
    // companyId: string;
    tenantId: mongoose.Types.ObjectId;
    email: string;
    password: string;
    role: UserRole;
    employeeId: string;
    avatar?: string;
    isActive: boolean;
    lastLogin?: Date;
    devices?: IUserDevice[];
    resetPasswordOtpHash?: string;
    resetPasswordExpires?: Date;
    googleRefreshToken?: string;
    pushSubscriptions?: {
        endpoint: string;
        expirationTime?: number | null;
        keys: {
            p256dh: string;
            auth: string;
        };
    }[];
    permissions: {
        allowedTabs: string[];
    };
    createdAt: Date;
    updatedAt: Date;
    comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
    {
        name: { type: String, required: true, trim: true },
        email: { type: String, required: true, lowercase: true, trim: true },
        password: { type: String, required: true, minlength: 6 },
        role: { type: String, enum: Object.values(UserRole), default: UserRole.MEMBER },
        employeeId: { type: String, unique: true, sparse: true },
        // companyId: { type: String, required: true, index: true },
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        avatar: { type: String },
        isActive: { type: Boolean, default: true },
        pushSubscriptions: [
            {
                endpoint: { type: String, required: true },
                expirationTime: { type: Number },
                keys: {
                    p256dh: { type: String, required: true },
                    auth: { type: String, required: true },
                },
            },
        ],
        lastLogin: { type: Date },
    devices: [
        {
            deviceId: { type: String, required: true },
            publicKey: { type: String, required: true },
            platform: { type: String, default: 'unknown' },
            createdAt: { type: Date, default: Date.now },
            _id: false,
        },
    ],
        resetPasswordOtpHash: { type: String },
        resetPasswordExpires: { type: Date },
        googleRefreshToken : { type: String, default: null},
        permissions: {
            allowedTabs: {
                type: [String],
                default: [
                    '/dashboard',
                    '/teams',
                    '/assignments',
                    '/tasks',
                    '/boards',
                    '/clients',
                    '/bulk-email',
                    '/canvas',
                    '/calendar',
                    '/chat',
                    '/reports',
                    '/settings',
                ],
            },
        },
    },
    { timestamps: true }
);

// userSchema.index({ email: 1, companyId: 1 }, { unique: true });
userSchema.index({ email: 1, tenantId: 1 }, { unique: true });

import Counter from './Counter';

userSchema.pre('save', async function (next) {
    if (this.isNew && !this.employeeId) {
        try {
            const counter = await Counter.findOneAndUpdate(
                { modelName: 'User' },
                { $inc: { seq: 1 } },
                { upsert: true, new: true }
            );
            this.employeeId = `ACEONE${counter.seq.toString().padStart(3, '0')}`;
        } catch (error: any) {
            return next(error);
        }
    }

    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
    return bcrypt.compare(candidatePassword, this.password);
};

userSchema.set('toJSON', {
    transform: (_doc: any, ret: any) => {
        delete ret.password;
        return ret;
    },
});

export default mongoose.model<IUser>('User', userSchema);
