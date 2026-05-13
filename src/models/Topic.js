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
    /** Subject bilan mos (maxfiy test); null = jamoat */
    companyOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

topicSchema.pre('save', async function (next) {
  try {
    if (this.isModified('subject') || this.isNew) {
      const Subject = (await import('./Subject.js')).Subject;
      const sub = await Subject.findById(this.subject).select('companyOwner').lean();
      this.companyOwner = sub?.companyOwner ? sub.companyOwner : null;
    }
    next();
  } catch (e) {
    next(e);
  }
});

topicSchema.index({ subject: 1, name: 1, companyOwner: 1 }, { unique: true });

export const Topic = mongoose.model('Topic', topicSchema);

