import mongoose from 'mongoose';

/** Admin panel — Habar sahifasi (ma’lumot saqlanmaydi) */
const schema = new mongoose.Schema({}, { collection: 'admin_habar_stub', strict: false });

export const AdminHabarStub =
  mongoose.models.AdminHabarStub || mongoose.model('AdminHabarStub', schema);
