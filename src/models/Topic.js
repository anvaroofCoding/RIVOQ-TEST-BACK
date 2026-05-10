import mongoose from 'mongoose';

const topicSchema = new mongoose.Schema(
  {
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    minutes: {
      type: Number,
      required: true,
      min: 1,
      max: 1000,
    },
    difficulty: {
      type: String,
      required: true,
      enum: ['OSON', "O'RTACHA", 'QIYIN'],
    },
    questionCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

topicSchema.index({ subject: 1, name: 1 }, { unique: true });

export const Topic = mongoose.model('Topic', topicSchema);

