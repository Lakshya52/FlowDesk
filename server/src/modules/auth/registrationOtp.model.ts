import mongoose, { Document, Schema } from 'mongoose';

export interface IRegistrationOtp extends Document {
    companyName: string;
    slug: string;
    name: string;
    email: string;
    password: string;
    website?: string;
    phone?: string;
    industry?: string;
    otp: string;
    otpExpires: Date;
    createdAt: Date;
}

const registrationOtpSchema = new Schema<IRegistrationOtp>(
    {
        companyName: { type: String, required: true },
        slug: { type: String, required: true },
        name: { type: String, required: true },
        email: { type: String, required: true, lowercase: true },
        password: { type: String, required: true },
        website: { type: String, default: '' },
        phone: { type: String, default: '' },
        industry: { type: String, default: '' },
        otp: { type: String, required: true },
        otpExpires: { type: Date, required: true },
    },
    { timestamps: true }
);

registrationOtpSchema.index({ email: 1 });
registrationOtpSchema.index({ otpExpires: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<IRegistrationOtp>('RegistrationOtp', registrationOtpSchema);