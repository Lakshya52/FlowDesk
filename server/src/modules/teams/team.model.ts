import mongoose, { Document, Schema } from "mongoose";

export interface ITeam extends Document {
  name: string;
  description: string;
  members: mongoose.Types.ObjectId[];
  joinRequests: mongoose.Types.ObjectId[];
  createdBy: mongoose.Types.ObjectId;
  manager: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const teamSchema = new Schema<ITeam>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    members: [{ type: Schema.Types.ObjectId, ref: "User" }],
    joinRequests: [{ type: Schema.Types.ObjectId, ref: "User" }],
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // manager: { type: Schema.Types.ObjectId, ref: "User", required: true },
    manager: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  },
  { timestamps: true },
);

teamSchema.index({ members: 1 });
teamSchema.index({ tenantId: 1 });

export default mongoose.model<ITeam>("Team", teamSchema);
