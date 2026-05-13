import mongoose from 'mongoose';

const topicInviteCodeSchema = new mongoose.Schema(
  {
    /** 6 ta raqam, noyob */
    code: {
      type: String,
      required: true,
      match: /^\d{6}$/,
      index: true,
      unique: true,
    },
    topic: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Topic',
      required: true,
      unique: true,
      index: true,
    },
    /** Kompaniya akkaunti (`role=company`) */
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    /** Kompaniya testni yopganda; null = hali ochiq, mobil kod ishlaydi */
    closedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

export const TopicInviteCode = mongoose.model('TopicInviteCode', topicInviteCodeSchema);
