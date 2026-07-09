import mongoose, { Document, Schema } from 'mongoose';

export interface ILocationPoint {
    lat: number;
    lng: number;
    accuracy: number;
    timestamp: Date;
}

export interface ILocationTrack extends Document {
    tenantId: mongoose.Types.ObjectId;
    visitId: mongoose.Types.ObjectId;
    employeeId: mongoose.Types.ObjectId;
    points: ILocationPoint[];
    startedAt: Date;
    endedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const locationPointSchema = new Schema<ILocationPoint>(
    {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
        accuracy: { type: Number, default: 0 },
        timestamp: { type: Date, default: Date.now },
    },
    { _id: false }
);

const locationTrackSchema = new Schema<ILocationTrack>(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
        visitId: { type: Schema.Types.ObjectId, ref: 'FieldVisit', required: true },
        employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        points: [locationPointSchema],
        startedAt: { type: Date, default: Date.now },
        endedAt: { type: Date },
    },
    { timestamps: true }
);

locationTrackSchema.index({ visitId: 1 });
locationTrackSchema.index({ employeeId: 1, startedAt: -1 });
locationTrackSchema.index({ tenantId: 1, startedAt: -1 });

export default mongoose.model<ILocationTrack>('LocationTrack', locationTrackSchema);
