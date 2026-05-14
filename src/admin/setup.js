import fs from 'fs/promises';
import path from 'path';
import { config } from '../config/index.js';
import { createMongoSessionStore } from '../config/database.js';
import AdminJS, { ComponentLoader, flat } from 'adminjs';
import AdminJSExpress from '@adminjs/express';
import * as AdminJSMongoose from '@adminjs/mongoose';
import bcryptjs from 'bcryptjs';
import { User } from '../models/User.js';
import { Subject } from '../models/Subject.js';
import { Topic } from '../models/Topic.js';
import { Question } from '../models/Question.js';
import { Notification } from '../models/Notification.js';
import { TopicInviteCode } from '../models/TopicInviteCode.js';
import { TestSession } from '../models/TestSession.js';
import { attachAdminWalletGrantRoutes } from './adminWalletGrant.js';

/** Kompaniya monitoringi: mavzu bo‘yicha har user uchun oxirgi sessiya */
async function buildParticipantRowsForTopic(topicId) {
  const tid = topicId ? String(topicId) : '';
  if (!tid) return [];

  const topic = await Topic.findById(tid).select('subject').lean();
  if (!topic?.subject) return [];

  const sub = await Subject.findById(topic.subject).select('companyOwner').lean();
  if (!sub?.companyOwner) return [];

  const sessions = await TestSession.find({ topic: tid })
    .populate('user', 'name email')
    .sort({ updatedAt: -1 })
    .lean();

  const byUser = new Map();
  for (const s of sessions) {
    const uid = String(s.user?._id || s.user || '');
    if (!uid) continue;
    const prev = byUser.get(uid);
    if (!prev || new Date(s.updatedAt) > new Date(prev.updatedAt)) {
      byUser.set(uid, s);
    }
  }

  const rows = [...byUser.values()].map((s) => {
    const u = s.user;
    const total = Math.max(0, Number(s.total) || (Array.isArray(s.questions) ? s.questions.length : 0));
    const answered = Array.isArray(s.questions) ? s.questions.filter((q) => q.selectedAnswer).length : 0;
    const progressPercent = total > 0 ? Math.round((answered / total) * 1000) / 10 : 0;
    const correctPercent =
      s.status === 'finished' && total > 0 ? Math.round((s.score / total) * 1000) / 10 : null;

    return {
      userId: u?._id,
      name: u?.name || '—',
      email: u?.email || '—',
      sessionId: s._id,
      status: s.status,
      progressPercent,
      score: s.score ?? 0,
      total,
      correctPercent,
      startedAt: s.startedAt,
      finishedAt: s.finishedAt || null,
    };
  });

  rows.sort((a, b) => {
    const ap = a.status === 'in_progress' ? 0 : 1;
    const bp = b.status === 'in_progress' ? 0 : 1;
    if (ap !== bp) return ap - bp;
    const ta = new Date(a.finishedAt || a.startedAt).getTime();
    const tb = new Date(b.finishedAt || b.startedAt).getTime();
    return tb - ta;
  });

  return rows;
}

AdminJS.registerAdapter({
  Database: AdminJSMongoose.Database,
  Resource: AdminJSMongoose.Resource,
});

export const setupAdmin = async (app) => {
  try {
    const fromRoot = (...p) => path.resolve(process.cwd(), ...p);
    const componentLoader = new ComponentLoader();
    const quickAddQuestionComponent = componentLoader.add(
      'QuickAddQuestion',
      fromRoot('src', 'admin', 'components', 'QuickAddQuestion.jsx')
    );
    const topicAddQuestionComponent = componentLoader.add(
      'TopicAddQuestion',
      fromRoot('src', 'admin', 'components', 'TopicAddQuestion.jsx')
    );
    const topicQuestionsListComponent = componentLoader.add(
      'TopicQuestionsList',
      fromRoot('src', 'admin', 'components', 'TopicQuestionsList.jsx')
    );
    const topicQuestionsInlineComponent = componentLoader.add(
      'TopicQuestionsInline',
      fromRoot('src', 'admin', 'components', 'TopicQuestionsInline.jsx')
    );
    const topicAccessCodeComponent = componentLoader.add(
      'TopicAccessCode',
      fromRoot('src', 'admin', 'components', 'TopicAccessCode.jsx')
    );
    const closeTestInviteActionComponent = componentLoader.add(
      'CloseTestInviteAction',
      fromRoot('src', 'admin', 'components', 'CloseTestInviteAction.jsx')
    );
    const topicInviteMonitorComponent = componentLoader.add(
      'TopicInviteMonitor',
      fromRoot('src', 'admin', 'components', 'TopicInviteMonitor.jsx')
    );
    const sendUserNotificationComponent = componentLoader.add(
      'SendUserNotification',
      fromRoot('src', 'admin', 'components', 'SendUserNotification.jsx')
    );
    const companyLogoUploadComponent = componentLoader.add(
      'CompanyLogoUpload',
      fromRoot('src', 'admin', 'components', 'CompanyLogoUpload.jsx')
    );
    const companyLogoShowComponent = componentLoader.add(
      'CompanyLogoShow',
      fromRoot('src', 'admin', 'components', 'CompanyLogoShow.jsx')
    );
    const walletGrantAdminComponent = componentLoader.add(
      'WalletGrantAdmin',
      fromRoot('src', 'admin', 'components', 'WalletGrantAdmin.jsx')
    );

    const companyLogoUploadDir = path.join(process.cwd(), 'public', 'uploads', 'company-logos');

    const onlyAdmin = ({ currentAdmin }) => currentAdmin?.role === 'admin';

    const onlyCompany = ({ currentAdmin }) => currentAdmin?.role === 'company';

    /** AdminJS reference maydonlari ba’zan `{ _id }` obyekt — `String()` bilan solishtirish xato */
    const normalizeRefId = (value) => {
      if (value == null || value === '') return '';
      if (typeof value === 'object') {
        if (value._id != null) return String(value._id);
        if (value.id != null) return String(value.id);
        if (typeof value.toHexString === 'function') return String(value.toHexString());
      }
      return String(value);
    };

    /** Test kirish kodlari yozuvi faqat o‘sha kompaniyaga tegishli */
    const canCompanyOwnInviteRecord = ({ currentAdmin, record }) => {
      if (!record) return false;
      if (currentAdmin?.role !== 'company') return false;
      return normalizeRefId(record.params?.company) === String(currentAdmin.id);
    };

    const adminOrCompany = ({ currentAdmin }) =>
      currentAdmin?.role === 'admin' || currentAdmin?.role === 'company';

    const mergeCompanySubjectList = (request, currentAdmin) => {
      if (!request || currentAdmin?.role !== 'company') return request;
      const q = flat.unflatten(request.query || {});
      q.filters = { ...(q.filters || {}), companyOwner: currentAdmin.id };
      request.query = flat.flatten(q);
      return request;
    };

    const mergeCompanyTopicList = (request, currentAdmin) => {
      if (!request || currentAdmin?.role !== 'company') return request;
      const q = flat.unflatten(request.query || {});
      q.filters = { ...(q.filters || {}), companyOwner: currentAdmin.id };
      request.query = flat.flatten(q);
      return request;
    };

    const mergeCompanyInviteList = (request, currentAdmin) => {
      if (!request || currentAdmin?.role !== 'company') return request;
      const q = flat.unflatten(request.query || {});
      q.filters = { ...(q.filters || {}), company: currentAdmin.id };
      request.query = flat.flatten(q);
      return request;
    };

    const canAccessCompanySubject = ({ currentAdmin, record }) => {
      if (!record) return false;
      if (currentAdmin?.role === 'admin') return true;
      if (currentAdmin?.role !== 'company') return false;
      return normalizeRefId(record.params?.companyOwner) === String(currentAdmin.id);
    };

    const canAccessCompanyTopic = ({ currentAdmin, record }) => {
      if (!record) return false;
      if (currentAdmin?.role === 'admin') return true;
      if (currentAdmin?.role !== 'company') return false;
      return normalizeRefId(record.params?.companyOwner) === String(currentAdmin.id);
    };

    const canGenerateTopicAccessCode = ({ currentAdmin, record }) => {
      if (!record) return false;
      if (currentAdmin?.role === 'admin') return true;
      return canAccessCompanyTopic({ currentAdmin, record });
    };

    const subjectNewSetCompanyOwner = async (request, context) => {
      if (request.method !== 'post' || context.currentAdmin?.role !== 'company') return request;
      const p = { ...(request.payload || {}) };
      p.companyOwner = context.currentAdmin.id;
      request.payload = p;
      return request;
    };

    const subjectEditKeepCompanyOwner = async (request, context) => {
      if (request.method !== 'post' || context.currentAdmin?.role !== 'company') return request;
      const p = { ...(request.payload || {}) };
      p.companyOwner = context.currentAdmin.id;
      request.payload = p;
      return request;
    };

    const topicNewValidateCompanySubject = async (request, context) => {
      if (request.method !== 'post' || context.currentAdmin?.role !== 'company') return request;
      const sid = request.payload?.subject;
      if (!sid) return request;
      const sub = await Subject.findById(sid).select('companyOwner').lean();
      if (!sub || String(sub.companyOwner || '') !== String(context.currentAdmin.id)) {
        throw new Error("Faqat o'z kompaniya faningizni tanlang");
      }
      return request;
    };

    const topicEditValidateCompanySubject = async (request, context) => {
      if (request.method !== 'post' || context.currentAdmin?.role !== 'company') return request;
      const sid = request.payload?.subject;
      if (!sid) return request;
      const sub = await Subject.findById(sid).select('companyOwner').lean();
      if (!sub || String(sub.companyOwner || '') !== String(context.currentAdmin.id)) {
        throw new Error("Faqat o'z kompaniya faningizni tanlang");
      }
      return request;
    };

    /** TopicInviteCode `New` — faqat mavzu tanlanadi; kod va company avtomatik */
    const topicInviteCodeNewBefore = async (request, context) => {
      if (request.method !== 'post') return request;
      const admin = context.currentAdmin;
      if (!admin) return request;

      const rawTopicId = request.payload?.topic;
      const topicId = rawTopicId ? String(rawTopicId) : '';
      if (!topicId) throw new Error('Mavzuni tanlang');

      let topic = await Topic.findById(topicId).select('companyOwner subject').lean();
      if (!topic) throw new Error('Mavzu topilmadi');

      if (!topic.companyOwner && topic.subject) {
        const sub = await Subject.findById(topic.subject).select('companyOwner').lean();
        if (sub?.companyOwner) {
          await Topic.updateOne({ _id: topicId }, { $set: { companyOwner: sub.companyOwner } });
          topic = { ...topic, companyOwner: sub.companyOwner };
        }
      }
      if (!topic.companyOwner) {
        throw new Error('Faqat maxfiy (kompaniya) mavzusi uchun — jamoat testlarida kirish kodi bo‘lmaydi.');
      }

      if (admin.role === 'company' && String(topic.companyOwner) !== String(admin.id)) {
        throw new Error('Bu mavzu sizning kompaniyangizga tegishli emas');
      }

      const existed = await TopicInviteCode.findOne({ topic: topicId }).lean();
      if (existed) {
        throw new Error(
          'Bu mavzu uchun kod allaqachon mavjud. Kodni yangilash: «Test yaratish» → Mavzu → «Testni boshlash — 6 raqamli kod».'
        );
      }

      const crypto = await import('crypto');
      let code = null;
      for (let attempt = 0; attempt < 50; attempt++) {
        const n = crypto.randomInt(0, 1_000_000);
        const candidate = String(n).padStart(6, '0');
        const row = await TopicInviteCode.findOne({ code: candidate }).lean();
        if (!row) {
          code = candidate;
          break;
        }
      }
      if (!code) throw new Error('Kod yaratilmadi — qayta urinib ko‘ring');

      const companyId =
        admin.role === 'company' ? admin.id : String(topic.companyOwner);

      request.payload = {
        topic: topicId,
        code,
        company: companyId,
      };
      return request;
    };

    /** TopicInviteCode tahriri (faqat admin): faqat mavzu — kod va company avtomatik */
    const topicInviteCodeEditBefore = async (request, context) => {
      if (request.method !== 'post') return request;
      if (context.currentAdmin?.role !== 'admin') return request;

      const recordId = context.record?.params?._id;
      const newTopicId = request.payload?.topic;
      if (!recordId || !newTopicId) return request;

      const oldTopicId = String(context.record.params?.topic ?? '');
      if (String(newTopicId) === oldTopicId) {
        return request;
      }

      let topic = await Topic.findById(newTopicId).select('companyOwner subject').lean();
      if (!topic) throw new Error('Mavzu topilmadi');

      if (!topic.companyOwner && topic.subject) {
        const sub = await Subject.findById(topic.subject).select('companyOwner').lean();
        if (sub?.companyOwner) {
          await Topic.updateOne({ _id: newTopicId }, { $set: { companyOwner: sub.companyOwner } });
          topic = { ...topic, companyOwner: sub.companyOwner };
        }
      }
      if (!topic.companyOwner) {
        throw new Error('Faqat maxfiy (kompaniya) mavzusi uchun.');
      }

      const other = await TopicInviteCode.findOne({
        topic: newTopicId,
        _id: { $ne: recordId },
      }).lean();
      if (other) {
        throw new Error('Bu mavzu uchun allaqachon boshqa kod yozuvi mavjud.');
      }

      const crypto = await import('crypto');
      let code = null;
      for (let attempt = 0; attempt < 50; attempt++) {
        const n = crypto.randomInt(0, 1_000_000);
        const candidate = String(n).padStart(6, '0');
        const taken = await TopicInviteCode.findOne({ code: candidate }).lean();
        if (!taken || String(taken._id) === String(recordId)) {
          code = candidate;
          break;
        }
      }
      if (!code) throw new Error('Kod yaratilmadi — qayta urinib ko‘ring');

      request.payload = {
        topic: newTopicId,
        code,
        company: String(topic.companyOwner),
      };
      return request;
    };

    const mergeCompanyListFilter = (request, currentAdmin) => {
      if (!request || currentAdmin?.role !== 'company') return request;
      const q = flat.unflatten(request.query || {});
      q.filters = { ...(q.filters || {}), companyId: currentAdmin.id };
      request.query = flat.flatten(q);
      return request;
    };

    const companyNewBefore = async (request, context) => {
      if (request.method !== 'post' || context.currentAdmin?.role !== 'company') return request;
      const p = { ...(request.payload || {}) };
      p.role = 'user';
      p.companyId = context.currentAdmin.id;
      p.companyLogo = null;
      request.payload = p;
      return request;
    };

    const companyEditBefore = async (request, context) => {
      if (request.method !== 'post' || context.currentAdmin?.role !== 'company') return request;
      const recordId = context.record?.params?._id ? String(context.record.params._id) : null;
      const myId = String(context.currentAdmin.id);
      const p = { ...(request.payload || {}) };
      const isSelf = recordId && recordId === myId;

      if (isSelf) {
        const allow = ['name', 'email', 'password', 'phone', 'companyLogo'];
        const next = {};
        allow.forEach((k) => {
          if (p[k] !== undefined) next[k] = p[k];
        });
        request.payload = next;
        return request;
      }

      const allowTeam = ['name', 'email', 'password', 'phone', 'isActive'];
      const next = {};
      allowTeam.forEach((k) => {
        if (p[k] !== undefined) next[k] = p[k];
      });
      next.role = 'user';
      next.companyId = myId;
      request.payload = next;
      return request;
    };

    const canCompanyAccessUserRecord = ({ currentAdmin, record }) => {
      if (!currentAdmin || !record) return false;
      if (currentAdmin.role === 'admin') return true;
      if (currentAdmin.role !== 'company') return false;
      const rid = String(record.params?._id ?? record.id?.() ?? '');
      if (rid === String(currentAdmin.id)) return true;
      const cid = record.params?.companyId;
      const role = record.params?.role;
      return Boolean(cid && String(cid) === String(currentAdmin.id) && role === 'user');
    };

    const hashPassword = async (request) => {
      if (request.method !== 'post') return request;

      const { password, ...rest } = request.payload || {};
      if (!password) {
        request.payload = rest;
        return request;
      }

      const salt = await bcryptjs.genSalt(10);
      const hashed = await bcryptjs.hash(String(password), salt);
      request.payload = { ...rest, password: hashed };
      return request;
    };

    const sanitizeCompanyLogoPayload = (request) => {
      if (request.method !== 'post') return request;
      const p = { ...(request.payload || {}) };
      if (String(p.role || 'user') !== 'company') {
        p.companyLogo = null;
      }
      request.payload = p;
      return request;
    };

    const handleCompanyLogoUpload = async (req, res) => {
      try {
        const adminUser = req.session?.adminUser;
        if (!adminUser) {
          return res.status(401).json({ error: 'Kirish kerak' });
        }
        if (adminUser.role !== 'admin' && adminUser.role !== 'company') {
          return res.status(403).json({ error: 'Ruxsat yoq' });
        }

        const raw = req.files?.file ?? req.files?.upload;
        const file = Array.isArray(raw) ? raw[0] : raw;
        if (!file?.path) {
          return res.status(400).json({ error: 'Fayl yuborilmadi' });
        }

        const maxSize = 2 * 1024 * 1024;
        if (file.size > maxSize) {
          return res.status(400).json({ error: 'Fayl juda katta (max 2 MB)' });
        }

        const mime = String(file.type || '');
        const allowedMime = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedMime.includes(mime)) {
          return res.status(400).json({ error: 'Faqat rasm fayllari (JPG, PNG, GIF, WEBP)' });
        }

        const extMap = {
          'image/jpeg': '.jpg',
          'image/png': '.png',
          'image/gif': '.gif',
          'image/webp': '.webp',
        };
        const ext = extMap[mime] || path.extname(file.name || '').toLowerCase() || '.img';
        await fs.mkdir(companyLogoUploadDir, { recursive: true });
        const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
        const dest = path.join(companyLogoUploadDir, name);
        await fs.copyFile(file.path, dest);
        await fs.unlink(file.path).catch(() => {});

        const url = `/uploads/company-logos/${name}`;
        return res.json({ url });
      } catch (e) {
        console.error('company logo upload:', e?.message || e);
        return res.status(500).json({ error: e?.message || 'Server xatosi' });
      }
    };

    const admin = new AdminJS({
      rootPath: '/admin',
      componentLoader,
      /** Ingliz fallback matnlari boshqacha bo‘lsa, startCase orqali "Grant Wallet Credits" chiqmasin */
      locale: {
        language: 'en',
        translations: {
          en: {
            labels: {
              dashboard: 'Bo‘lim',
            },
            resources: {
              User: {
                actions: {
                  grantWalletCredits: 'Coin va score berish',
                },
              },
            },
          },
        },
      },
      resources: [
        {
          resource: Subject,
          options: {
            navigation: { name: 'Test yaratish' },
            name: 'Fan',
            titleProperty: 'name',
            listProperties: ['_id', 'name', 'companyOwner', 'description', 'createdAt'],
            editProperties: ['name', 'description'],
            showProperties: ['_id', 'name', 'companyOwner', 'description', 'createdAt', 'updatedAt'],
            filterProperties: ['name', 'companyOwner'],
            actions: {
              list: {
                isAccessible: adminOrCompany,
                before: async (request, context) => mergeCompanySubjectList(request, context.currentAdmin),
              },
              search: {
                isAccessible: adminOrCompany,
                before: async (request, context) => mergeCompanySubjectList(request, context.currentAdmin),
              },
              show: { isAccessible: ({ currentAdmin, record }) => canAccessCompanySubject({ currentAdmin, record }) },
              new: {
                isAccessible: adminOrCompany,
                before: async (request, context) => subjectNewSetCompanyOwner(request, context),
              },
              edit: {
                isAccessible: ({ currentAdmin, record }) => canAccessCompanySubject({ currentAdmin, record }),
                before: async (request, context) => subjectEditKeepCompanyOwner(request, context),
              },
              delete: {
                isAccessible: ({ currentAdmin, record }) => canAccessCompanySubject({ currentAdmin, record }),
              },
              bulkDelete: { isAccessible: onlyAdmin },
            },
          },
        },
        {
          resource: Topic,
          options: {
            navigation: { name: 'Test yaratish' },
            name: 'Mavzu yaratish',
            titleProperty: 'name',
            listProperties: ['_id', 'subject', 'name', 'companyOwner', 'difficulty', 'minutes', 'questionCount', 'createdAt'],
            editProperties: ['subject', 'name', 'description', 'minutes', 'difficulty'],
            showProperties: ['_id', 'subject', 'name', 'companyOwner', 'description', 'difficulty', 'minutes', 'questionCount', 'questionsInline', 'createdAt', 'updatedAt'],
            filterProperties: ['subject', 'name', 'difficulty', 'companyOwner'],
            properties: {
              subject: {
                reference: 'Subject',
                isRequired: true,
              },
              questionsInline: {
                isVisible: { list: false, filter: false, edit: false, show: true },
                components: { show: topicQuestionsInlineComponent },
              },
              difficulty: {
                availableValues: [
                  { value: 'OSON', label: 'OSON' },
                  { value: "O'RTACHA", label: "O'RTACHA" },
                  { value: 'QIYIN', label: 'QIYIN' },
                ],
              },
              minutes: {
                type: 'number',
                isRequired: true,
              },
            },
            actions: {
              list: {
                isAccessible: adminOrCompany,
                before: async (request, context) => mergeCompanyTopicList(request, context.currentAdmin),
              },
              search: {
                isAccessible: adminOrCompany,
                before: async (request, context) => mergeCompanyTopicList(request, context.currentAdmin),
              },
              show: { isAccessible: ({ currentAdmin, record }) => canAccessCompanyTopic({ currentAdmin, record }) },
              new: {
                isAccessible: adminOrCompany,
                before: async (request, context) => topicNewValidateCompanySubject(request, context),
              },
              edit: {
                isAccessible: ({ currentAdmin, record }) => canAccessCompanyTopic({ currentAdmin, record }),
                before: async (request, context) => topicEditValidateCompanySubject(request, context),
              },
              delete: {
                isAccessible: ({ currentAdmin, record }) => canAccessCompanyTopic({ currentAdmin, record }),
              },
              bulkDelete: { isAccessible: onlyAdmin },
              addQuestion: {
                isAccessible: canAccessCompanyTopic,
                actionType: 'record',
                icon: 'Add',
                label: 'Savol qo‘shish',
                showInDrawer: false,
                component: topicAddQuestionComponent,
                handler: async (request, response, context) => {
                  const { record } = context;
                  const topicId = record?.params?._id;
                  if (!topicId) {
                    return { notice: { message: 'Topic topilmadi', type: 'error' } };
                  }

                  if (request.method !== 'post') {
                    const questions = await Question.find({ topic: topicId })
                      .sort({ createdAt: -1 })
                      .limit(200)
                      .lean();
                    return { record: record.toJSON(context.currentAdmin), meta: { questions } };
                  }

                  try {
                    const p = request.payload || {};

                    const question = String(p.question || '').trim();
                    const correctAnswer = String(p.correctAnswer || '').trim();
                    const wrongAnswer1 = String(p.wrongAnswer1 || '').trim();
                    const wrongAnswer2 = String(p.wrongAnswer2 || '').trim();
                    const wrongAnswer3 = String(p.wrongAnswer3 || '').trim();

                    if (!question || !correctAnswer || !wrongAnswer1 || !wrongAnswer2 || !wrongAnswer3) {
                      const questions = await Question.find({ topic: topicId })
                        .sort({ createdAt: -1 })
                        .limit(200)
                        .lean();
                      return {
                        notice: { message: "Hammasini to‘ldiring: savol + 1 to‘g‘ri + 3 xato", type: 'error' },
                        record: record.toJSON(context.currentAdmin),
                        meta: { questions },
                      };
                    }

                    await Question.create({
                      topic: topicId,
                      question,
                      correctAnswer,
                      wrongAnswer1,
                      wrongAnswer2,
                      wrongAnswer3,
                    });

                    const count = await Question.countDocuments({ topic: topicId });
                    await Topic.updateOne({ _id: topicId }, { $set: { questionCount: count } });

                    const questions = await Question.find({ topic: topicId })
                      .sort({ createdAt: -1 })
                      .limit(200)
                      .lean();

                    return {
                      notice: { message: 'Savol qo‘shildi', type: 'success' },
                      record: record.toJSON(context.currentAdmin),
                      meta: { questions },
                    };
                  } catch (e) {
                    const questions = await Question.find({ topic: topicId })
                      .sort({ createdAt: -1 })
                      .limit(200)
                      .lean();
                    return {
                      notice: { message: e?.message || 'Xatolik', type: 'error' },
                      record: record.toJSON(context.currentAdmin),
                      meta: { questions },
                    };
                  }
                },
              },
              questions: {
                isAccessible: canAccessCompanyTopic,
                actionType: 'record',
                icon: 'List',
                label: 'Savollar',
                // used by inline component; don't show as a modal/drawer action
                isVisible: false,
                showInDrawer: false,
                component: topicQuestionsListComponent,
                handler: async (request, response, context) => {
                  const { record } = context;
                  const topicId = record?.params?._id;
                  if (!topicId) {
                    return { notice: { message: 'Topic topilmadi', type: 'error' } };
                  }
                  const questions = await Question.find({ topic: topicId })
                    .sort({ createdAt: -1 })
                    .limit(200)
                    .lean();

                  return {
                    record: record.toJSON(context.currentAdmin),
                    meta: { questions },
                  };
                },
              },
              updateQuestion: {
                isAccessible: canAccessCompanyTopic,
                actionType: 'record',
                isVisible: false,
                handler: async (request, response, context) => {
                  const { record } = context;
                  const topicId = record?.params?._id;
                  if (!topicId) {
                    return { notice: { message: 'Topic topilmadi', type: 'error' }, record: record?.toJSON?.(context.currentAdmin) };
                  }
                  if (request.method !== 'post') {
                    return { notice: { message: 'Invalid method', type: 'error' }, record: record.toJSON(context.currentAdmin) };
                  }

                  try {
                    const p = request.payload || {};
                    const questionId = String(p.questionId || '').trim();
                    if (!questionId) {
                      return { notice: { message: 'questionId kerak', type: 'error' }, record: record.toJSON(context.currentAdmin) };
                    }

                    const existing = await Question.findOne({ _id: questionId, topic: topicId });
                    if (!existing) {
                      return { notice: { message: 'Savol topilmadi', type: 'error' }, record: record.toJSON(context.currentAdmin) };
                    }

                    const update = {
                      question: String(p.question || '').trim(),
                      correctAnswer: String(p.correctAnswer || '').trim(),
                      wrongAnswer1: String(p.wrongAnswer1 || '').trim(),
                      wrongAnswer2: String(p.wrongAnswer2 || '').trim(),
                      wrongAnswer3: String(p.wrongAnswer3 || '').trim(),
                    };

                    await Question.updateOne({ _id: questionId, topic: topicId }, { $set: update });

                    return { notice: { message: 'Savol yangilandi', type: 'success' }, record: record.toJSON(context.currentAdmin) };
                  } catch (e) {
                    return { notice: { message: e?.message || 'Xatolik', type: 'error' }, record: record.toJSON(context.currentAdmin) };
                  }
                },
              },
              deleteQuestion: {
                isAccessible: canAccessCompanyTopic,
                actionType: 'record',
                isVisible: false,
                handler: async (request, response, context) => {
                  const { record } = context;
                  const topicId = record?.params?._id;
                  if (!topicId) {
                    return { notice: { message: 'Topic topilmadi', type: 'error' }, record: record?.toJSON?.(context.currentAdmin) };
                  }
                  if (request.method !== 'post') {
                    return { notice: { message: 'Invalid method', type: 'error' }, record: record.toJSON(context.currentAdmin) };
                  }

                  try {
                    const p = request.payload || {};
                    const questionId = String(p.questionId || '').trim();
                    if (!questionId) {
                      return { notice: { message: 'questionId kerak', type: 'error' }, record: record.toJSON(context.currentAdmin) };
                    }

                    await Question.deleteOne({ _id: questionId, topic: topicId });

                    const count = await Question.countDocuments({ topic: topicId });
                    await Topic.updateOne({ _id: topicId }, { $set: { questionCount: count } });

                    return { notice: { message: 'Savol o‘chirildi', type: 'success' }, record: record.toJSON(context.currentAdmin) };
                  } catch (e) {
                    return { notice: { message: e?.message || 'Xatolik', type: 'error' }, record: record.toJSON(context.currentAdmin) };
                  }
                },
              },
              generateAccessCode: {
                actionType: 'record',
                icon: 'Key',
                label: 'Testni boshlash — 6 raqamli kod',
                showInDrawer: false,
                component: topicAccessCodeComponent,
                isAccessible: canGenerateTopicAccessCode,
                handler: async (request, response, context) => {
                  const { record, currentAdmin } = context;
                  const topicId = record?.params?._id;
                  if (!topicId) {
                    return { notice: { message: 'Mavzu topilmadi', type: 'error' } };
                  }

                  let topic = await Topic.findById(topicId).select('companyOwner subject').lean();
                  if (!topic) {
                    return { notice: { message: 'Mavzu topilmadi', type: 'error' }, record: record.toJSON(currentAdmin) };
                  }

                  if (!topic.companyOwner) {
                    const subForSync = await Subject.findById(topic.subject).select('companyOwner').lean();
                    if (subForSync?.companyOwner) {
                      await Topic.updateOne({ _id: topicId }, { $set: { companyOwner: subForSync.companyOwner } });
                      topic = { ...topic, companyOwner: subForSync.companyOwner };
                    }
                  }

                  const isPost = String(request.method || '').toLowerCase() === 'post';
                  const wantsRegenerate = Boolean(request.payload?.regenerate);

                  if (!isPost || !wantsRegenerate) {
                    const existing = await TopicInviteCode.findOne({ topic: topicId }).lean();
                    return {
                      record: record.toJSON(currentAdmin),
                      meta: { code: existing?.code || '' },
                    };
                  }

                  if (!topic.companyOwner) {
                    return {
                      notice: {
                        message: 'Bu mavzu jamoat katalogi uchun — 6 raqamli kod faqat maxfiy (kompaniya) mavzular uchun.',
                        type: 'error',
                      },
                      record: record.toJSON(currentAdmin),
                      meta: { code: '' },
                    };
                  }

                  if (currentAdmin?.role === 'company' && String(topic.companyOwner) !== String(currentAdmin.id)) {
                    return { notice: { message: 'Ruxsat yo‘q', type: 'error' }, record: record.toJSON(currentAdmin) };
                  }

                  const companyId = topic.companyOwner;
                  const crypto = await import('crypto');

                  let code = null;
                  for (let attempt = 0; attempt < 50; attempt++) {
                    const n = crypto.randomInt(0, 1_000_000);
                    const candidate = String(n).padStart(6, '0');
                    const row = await TopicInviteCode.findOne({ code: candidate }).lean();
                    if (!row || String(row.topic) === String(topicId)) {
                      code = candidate;
                      break;
                    }
                  }
                  if (!code) {
                    return {
                      notice: { message: 'Kod yaratilmadi — qayta urinib ko‘ring', type: 'error' },
                      record: record.toJSON(currentAdmin),
                      meta: { code: '' },
                    };
                  }

                  await TopicInviteCode.findOneAndUpdate(
                    { topic: topicId },
                    { $set: { code, company: companyId, topic: topicId, closedAt: null } },
                    { upsert: true, new: true }
                  );

                  return {
                    notice: {
                      message: `Kirish kodi: ${code} — oddiy foydalanuvchiga yuboring (mobil ilova: 6 raqamli kod bilan testni boshlash).`,
                      type: 'success',
                    },
                    record: record.toJSON(currentAdmin),
                    meta: { code },
                  };
                },
              },
              closeInviteForTopic: {
                actionType: 'record',
                icon: 'PowerOff',
                label: 'Testni yopish (kod bekor)',
                showInDrawer: false,
                component: closeTestInviteActionComponent,
                isAccessible: canGenerateTopicAccessCode,
                handler: async (request, response, context) => {
                  const isPost = String(request.method || '').toLowerCase() === 'post';
                  const confirmed = Boolean(request.payload?.confirm);
                  if (!isPost || !confirmed) {
                    const { record, currentAdmin } = context;
                    return { record: record?.toJSON?.(currentAdmin) };
                  }

                  const { record, currentAdmin } = context;
                  const topicId = record?.params?._id;
                  if (!topicId) {
                    return { notice: { message: 'Mavzu topilmadi', type: 'error' }, record: record.toJSON(currentAdmin) };
                  }

                  const top = await Topic.findById(topicId).select('companyOwner subject').lean();
                  if (!top?.companyOwner) {
                    return {
                      notice: { message: 'Bu jamoat mavzusi — kodni yopish shart emas.', type: 'info' },
                      record: record.toJSON(currentAdmin),
                    };
                  }
                  if (currentAdmin?.role === 'company' && String(top.companyOwner) !== String(currentAdmin.id)) {
                    return { notice: { message: 'Ruxsat yo‘q', type: 'error' }, record: record.toJSON(currentAdmin) };
                  }

                  const existingInv = await TopicInviteCode.findOne({ topic: topicId }).lean();
                  if (!existingInv) {
                    return {
                      notice: {
                        message:
                          'Bu mavzu uchun kirish yozuvi topilmadi — avval «6 raqamli kod» yarating.',
                        type: 'info',
                      },
                      record: record.toJSON(currentAdmin),
                    };
                  }
                  if (existingInv.closedAt) {
                    return {
                      notice: { message: 'Bu test allaqachon «tugatilgan» holatida.', type: 'info' },
                      record: record.toJSON(currentAdmin),
                    };
                  }

                  await TopicInviteCode.updateOne({ topic: topicId }, { $set: { closedAt: new Date() } });

                  return {
                    notice: {
                      message:
                        'Test tugatildi — mobil kirish yopildi, yozuv o‘chirilmadi (historiya + ishtirokchilar ro‘yxati saqlanadi). Yangi raund: «6 raqamli kod» bilan kod yangilang.',
                      type: 'success',
                    },
                    record: record.toJSON(currentAdmin),
                  };
                },
              },
            },
          },
        },
        {
          resource: TopicInviteCode,
          options: {
            navigation: { name: 'Kompaniya' },
            name: 'Test kirish kodlari',
            titleProperty: 'code',
            listProperties: ['code', 'topic', 'company', 'closedAt', 'createdAt'],
            newProperties: ['topic'],
            editProperties: ['topic'],
            showProperties: ['code', 'topic', 'company', 'closedAt', 'createdAt', 'updatedAt'],
            filterProperties: ['code', 'closedAt'],
            properties: {
              topic: {
                reference: 'Topic',
                isRequired: true,
                description:
                  'Shunchaki mavzuni tanlang. 6 raqamli kod avtomatik chiqadi; kompaniya ham mavzu orqali o‘zi bog‘lanadi — alohida tanlash yo‘q.',
              },
              closedAt: {
                description: 'Yopilgan vaqt. Bo‘sh = test ochiq, mobil kod ishlaydi.',
              },
              company: {
                reference: 'User',
                description: 'Yangi yozuvda avtomatik: mavzu qaysi kompaniyaga tegishli bo‘lsa.',
                props: { isDisabled: true },
                isVisible: {
                  list: true,
                  filter: false,
                  show: true,
                  edit: false,
                  new: false,
                },
              },
              code: {
                description: 'Avtomatik yaratiladi — qo‘lda kiritish shart emas.',
                props: { isDisabled: true },
                isVisible: {
                  list: true,
                  filter: true,
                  show: true,
                  edit: false,
                  new: false,
                },
              },
            },
            actions: {
              list: {
                isAccessible: onlyCompany,
                before: async (request, context) => mergeCompanyInviteList(request, context.currentAdmin),
              },
              search: {
                isAccessible: onlyCompany,
                before: async (request, context) => mergeCompanyInviteList(request, context.currentAdmin),
              },
              show: { isAccessible: canCompanyOwnInviteRecord },
              participantsOverview: {
                actionType: 'record',
                icon: 'Users',
                label: 'Ishtirokchilar va natijalar',
                showInDrawer: false,
                component: topicInviteMonitorComponent,
                isAccessible: canCompanyOwnInviteRecord,
                handler: async (request, response, context) => {
                  const { record, currentAdmin } = context;
                  const inviteId = record?.params?._id;
                  if (!inviteId) {
                    return { notice: { message: 'Yozuv topilmadi', type: 'error' } };
                  }
                  const inv = await TopicInviteCode.findById(inviteId).lean();
                  if (!inv || String(inv.company) !== String(currentAdmin.id)) {
                    return { notice: { message: 'Ruxsat yoq', type: 'error' } };
                  }
                  const rows = await buildParticipantRowsForTopic(inv.topic);
                  return {
                    record: record.toJSON(currentAdmin),
                    meta: {
                      rows,
                      closedAt: inv.closedAt || null,
                      code: inv.code,
                    },
                  };
                },
              },
              closeThisInvite: {
                actionType: 'record',
                icon: 'PowerOff',
                label: 'Testni tugatish (mobil kod yopiladi)',
                showInDrawer: false,
                component: closeTestInviteActionComponent,
                isAccessible: canCompanyOwnInviteRecord,
                handler: async (request, response, context) => {
                  const isPost = String(request.method || '').toLowerCase() === 'post';
                  const confirmed = Boolean(request.payload?.confirm);
                  if (!isPost || !confirmed) {
                    const { record, currentAdmin } = context;
                    return { record: record?.toJSON?.(currentAdmin) };
                  }

                  const id = context.record?.params?._id;
                  const { currentAdmin } = context;
                  if (!id) {
                    return { notice: { message: 'Yozuv topilmadi', type: 'error' } };
                  }
                  const rec = await TopicInviteCode.findById(id).lean();
                  if (!rec) {
                    return { notice: { message: 'Yozuv topilmadi', type: 'error' } };
                  }
                  if (String(rec.company) !== String(currentAdmin.id)) {
                    return { notice: { message: 'Ruxsat yo‘q', type: 'error' } };
                  }
                  if (rec.closedAt) {
                    return {
                      notice: { message: 'Bu test allaqachon yopilgan.', type: 'info' },
                      record: context.record?.toJSON?.(currentAdmin),
                    };
                  }
                  await TopicInviteCode.updateOne({ _id: id }, { $set: { closedAt: new Date() } });
                  return {
                    notice: {
                      message:
                        'Test yopildi — yozuv saqlanadi, mobil kod endi ishlamaydi. Ishtirokchilar: «Ishtirokchilar va natijalar».',
                      type: 'success',
                    },
                    record: context.record?.toJSON?.(currentAdmin),
                  };
                },
              },
              new: {
                isAccessible: onlyCompany,
                before: topicInviteCodeNewBefore,
              },
              edit: {
                isAccessible: onlyAdmin,
                before: topicInviteCodeEditBefore,
              },
              delete: { isAccessible: onlyAdmin },
              bulkDelete: { isAccessible: onlyAdmin },
            },
          },
        },
        {
          resource: User,
          options: {
            navigation: { name: 'Kompaniya' },
            name: 'Foydalanuvchilar',
            titleProperty: 'name',
            listProperties: ['_id', 'name', 'email', 'role', 'companyId', 'companyLogo', 'isActive', 'createdAt'],
            filterProperties: ['email', 'role', 'isActive', 'companyId'],
            editProperties: [
              'name',
              'email',
              'password',
              'phone',
              'role',
              'companyId',
              'companyLogo',
              'isActive',
            ],
            showProperties: [
              '_id',
              'name',
              'email',
              'phone',
              'role',
              'companyId',
              'companyLogo',
              'isActive',
              'createdAt',
              'updatedAt',
            ],
            properties: {
              password: { type: 'password' },
              companyLogo: {
                components: {
                  edit: companyLogoUploadComponent,
                  show: companyLogoShowComponent,
                },
              },
              companyId: {
                description:
                  'Kompaniya akkauntining MongoDB ID si: qaysi kompaniyaga tegishli oddiy foydalanuvchi ekanini ko‘rsatadi. Foydalanuvchini faqat admin yaratadi — shu maydonni to‘g‘ri kompaniya ID bilan to‘ldiring; kompaniya (role=company) akkauntida tahrirlashda bo‘sh qoldiring.',
                reference: 'User',
                props: {
                  placeholder: 'Faqat oddiy user (jamoa a’zosi) uchun',
                },
              },
              role: {
                availableValues: [
                  { value: 'user', label: 'User' },
                  { value: 'admin', label: 'Admin' },
                  { value: 'company', label: 'Kompaniya' },
                ],
              },
            },
            actions: {
              list: {
                before: async (request, context) => mergeCompanyListFilter(request, context.currentAdmin),
              },
              search: {
                before: async (request, context) => mergeCompanyListFilter(request, context.currentAdmin),
              },
              new: {
                before: async (request, context) => {
                  let r = sanitizeCompanyLogoPayload(request);
                  r = await companyNewBefore(r, context);
                  return hashPassword(r);
                },
                isAccessible: onlyAdmin,
              },
              show: { isAccessible: canCompanyAccessUserRecord },
              edit: {
                isAccessible: canCompanyAccessUserRecord,
                before: async (request, context) => {
                  let r = sanitizeCompanyLogoPayload(request);
                  r = await companyEditBefore(r, context);
                  return hashPassword(r);
                },
              },
              delete: { isAccessible: onlyAdmin },
              bulkDelete: { isAccessible: onlyAdmin },
              grantWalletCredits: {
                actionType: 'resource',
                icon: 'Award',
                label: 'Coin va score berish',
                component: walletGrantAdminComponent,
                isAccessible: onlyAdmin,
                showInDrawer: false,
                handler: async () => ({ meta: {} }),
              },
              myCompanyProfile: {
                actionType: 'resource',
                icon: 'Settings',
                label: 'Kompaniya profili (logo, email, parol)',
                isAccessible: ({ currentAdmin }) => currentAdmin?.role === 'company',
                handler: async (request, response, context) => {
                  const root = context._admin.options.rootPath || '/admin';
                  return {
                    redirectUrl: `${root}/resources/User/records/${context.currentAdmin.id}/edit`,
                  };
                },
              },
              sendNotification: {
                actionType: 'record',
                icon: 'Chat',
                label: 'Notification yuborish',
                showInDrawer: true,
                isAccessible: onlyAdmin,
                component: sendUserNotificationComponent,
                handler: async (request, response, context) => {
                  const { record, currentAdmin } = context;
                  const userId = record?.params?._id;
                  if (!userId) {
                    return { notice: { message: 'User topilmadi', type: 'error' } };
                  }

                  if (request.method !== 'post') {
                    return { record: record.toJSON(currentAdmin) };
                  }

                  try {
                    const p = request.payload || {};
                    const title = String(p.title || '').trim();
                    const body = String(p.body || '').trim();
                    const type = String(p.type || 'system').trim() || 'system';

                    if (!title || !body) {
                      return {
                        notice: { message: 'Title va body to‘ldiring', type: 'error' },
                        record: record.toJSON(currentAdmin),
                      };
                    }

                    const allowed = ['daily_reminder', 'rank_up', 'rank_down', 'system'];
                    const finalType = allowed.includes(type) ? type : 'system';

                    await Notification.create({
                      user: userId,
                      type: finalType,
                      title,
                      body,
                      data: { screen: 'Notifications', from: 'admin' },
                    });

                    return {
                      notice: { message: 'Notification yuborildi', type: 'success' },
                      record: record.toJSON(currentAdmin),
                    };
                  } catch (e) {
                    return {
                      notice: { message: e?.message || 'Xatolik', type: 'error' },
                      record: record.toJSON(currentAdmin),
                    };
                  }
                },
              },
            },
          },
        },
      ],
      branding: {
        companyName: 'RIVOQ',
        withMadeWithLove: false,
      },
    });

    // AdminJS dev rejimida `.adminjs/bundle.js` keshi ba’zan yangi ComponentLoader komponentlarini
    // o‘z ichiga olmaydi — CompanyLogoUpload kabi xatolarni oldini olish uchun keshni yo‘q qilamiz.
    if (process.env.NODE_ENV !== 'production') {
      void fs
        .unlink(path.join(process.cwd(), '.adminjs', 'bundle.js'))
        .catch(() => {});
      void admin.watch().catch((e) => console.error('AdminJS watch:', e?.message || e));
    } else {
      try {
        await admin.initialize();
        process.env.ADMIN_JS_SKIP_BUNDLE = 'true';
      } catch (e) {
        console.error('AdminJS bundle:', e?.stack || e?.message || e);
        throw e;
      }
    }

    const ADMIN_PANEL_PASSWORD = process.env.ADMIN_PANEL_PASSWORD || '123123';

    const adminRouter = AdminJSExpress.buildAuthenticatedRouter(
      admin,
      {
        authenticate: async (email, password) => {
          if (!email || !password) return null;
          if (password !== ADMIN_PANEL_PASSWORD) return null;

          const user = await User.findOne({ email: String(email).toLowerCase() });
          if (!user || user.isActive === false) return null;
          if (user.role !== 'admin' && user.role !== 'company') return null;

          return {
            email: user.email,
            title: user.name,
            id: String(user._id),
            role: user.role,
            avatarUrl: user.companyLogo || user.avatar || undefined,
          };
        },
        cookiePassword: process.env.ADMIN_COOKIE_PASSWORD || 'change_this_cookie_secret_in_production',
      },
      null,
      {
        resave: false,
        saveUninitialized: false,
        store: createMongoSessionStore(),
        cookie: {
          maxAge: 24 * 60 * 60 * 1000,
          secure: config.node_env === 'production',
          httpOnly: true,
          sameSite: 'lax',
        },
      }
    );

    adminRouter.post('/upload/company-logo', handleCompanyLogoUpload);

    attachAdminWalletGrantRoutes(adminRouter);

    app.use(admin.options.rootPath, adminRouter);

    return admin;
  } catch (error) {
    console.error('Admin panel setup error:', error);
    throw error;
  }
};

/** `connectDB()` dan keyin chaqiring — mongoose ulanmaguncha User so‘rovi buffering timeout bermasligi uchun */
export async function ensureDefaultAdminPanelUser() {
  const email = String(process.env.ADMIN_EMAIL || 'admin@rivoq.com').toLowerCase();
  try {
    const existing = await User.findOne({ email });
    if (!existing) {
      await User.create({
        name: 'Admin',
        email,
        phone: '',
        password: Math.random().toString(36).slice(-10),
        role: 'admin',
        isActive: true,
      });
      console.log('✓ Default admin user created:', email);
    } else if (existing.role !== 'admin' || existing.isActive === false) {
      await User.updateOne({ _id: existing._id }, { $set: { role: 'admin', isActive: true } });
      console.log('✓ Default admin user ensured:', email);
    }
  } catch (e) {
    console.error('Failed to ensure default admin user:', e?.message || e);
  }
}
