const mongoose = require('mongoose');

const { Schema, Types } = mongoose;

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['student', 'mentor'], required: true },
    skills: { type: [String], default: [], index: true },
    tokens: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);
userSchema.index({ role: 1, skills: 1 });

const bountySchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    tags: { type: [String], default: [] },
    reward: { type: Number, required: true, min: 1 },
    sessionMinutes: { type: Number, required: true },
    postedBy: { type: Types.ObjectId, ref: 'User', required: true },
    acceptedBy: { type: Types.ObjectId, ref: 'User', default: null },
    roomId: { type: Types.ObjectId, ref: 'Room', default: null },
    status: {
      type: String,
      enum: ['open', 'accepted', 'completed', 'cancelled', 'expired'],
      default: 'open',
    },
    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
bountySchema.index({ status: 1, expiresAt: 1 });
bountySchema.index({ postedBy: 1, createdAt: -1 });
bountySchema.index({ acceptedBy: 1, createdAt: -1 });

const messageSchema = new Schema(
  {
    sender: { type: Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    sentAt: { type: Date, required: true },
  },
  { _id: true },
);

const roomSchema = new Schema(
  {
    bountyId: { type: Types.ObjectId, ref: 'Bounty', required: true, unique: true },
    participants: [{ type: Types.ObjectId, ref: 'User', required: true }],
    status: { type: String, enum: ['active', 'closed'], default: 'active' },
    notes: { type: String, default: '' },
    messages: { type: [messageSchema], default: [] },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Bounty = mongoose.models.Bounty || mongoose.model('Bounty', bountySchema);
const Room = mongoose.models.Room || mongoose.model('Room', roomSchema);

module.exports = { User, Bounty, Room };
