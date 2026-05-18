import mongoose from 'mongoose';

/** Faqat admin panel sidebar — Monitoring ro‘yxati (ma’lumot saqlanmaydi) */
const schema = new mongoose.Schema({}, { collection: 'admin_monitoring_stub', strict: false });

export const AdminMonitoringStub =
  mongoose.models.AdminMonitoringStub || mongoose.model('AdminMonitoringStub', schema);
