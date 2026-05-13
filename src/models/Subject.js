import mongoose from 'mongoose';

const subjectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    /** `null` = jamoat (mobil ilovada ko‘rinadi). Kompaniya testlari uchun Company user `_id` */
    companyOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

subjectSchema.index({ name: 1, companyOwner: 1 }, { unique: true });

export const Subject = mongoose.model('Subject', subjectSchema);

