import mongoose, { Document, Schema } from "mongoose";

export interface IKnowledgeChunk extends Document {
  source: string;
  sectionTitle: string;
  content: string;
  embedding: number[];
  metadata: {
    page?: string;
    tags: string[];
  };
  createdAt: Date;
}

const knowledgeChunkSchema = new Schema<IKnowledgeChunk>(
  {
    source: {
      type: String,
      required: true,
      index: true,
    },
    sectionTitle: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    embedding: {
      type: [Number],
      required: true,
    },
    metadata: {
      page: { type: String },
      tags: { type: [String], default: [] },
    },
  },
  { timestamps: true }
);

knowledgeChunkSchema.index({ source: 1 });
knowledgeChunkSchema.index({ "metadata.page": 1 });

export default mongoose.model<IKnowledgeChunk>(
  "KnowledgeChunk",
  knowledgeChunkSchema
);
