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
import { AdminMonitoringStub } from '../models/AdminMonitoringStub.js';
import { AdminHabarStub } from '../models/AdminHabarStub.js';
import { attachAdminWalletGrantRoutes } from './adminWalletGrant.js';
import { attachCompanyTestRoutes } from './adminCompanyTest.js';
import { attachMonitoringRoutes } from './adminMonitoring.js';
import { attachHabarRoutes } from './adminHabar.js';
import {
  ensureTopicInviteIndexes,
  buildParticipantRowsForInvite,
  createInviteForTopic,
  findActiveInviteForTopic,
  generateUniqueInviteCode,
  closeInviteById,
  inviteStatusLabel,
} from '../services/companyInviteService.js';
import { blockUserForCompany, unblockUserForCompany } from '../services/companyBlockService.js';
import { adminUzLocale } from './locale/uz.js';

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
    const testMonitoringPageComponent = componentLoader.add(
      'TestMonitoringPage',
      fromRoot('src', 'admin', 'components', 'TestMonitoringPage.jsx')
    );
    const habarPageComponent = componentLoader.add(
      'HabarPage',
      fromRoot('src', 'admin', 'components', 'HabarPage.jsx')
    );
    const myProfileRedirectComponent = componentLoader.add(
      'MyProfileRedirect',
      fromRoot('src', 'admin', 'components', 'MyProfileRedirect.jsx')
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

    /** Ro‘yxatda yangi qo‘shilganlar birinchi (default tartib) */
    const mergeNewestFirstSort = (request, sortBy = 'createdAt') => {
      if (!request) return request;
      const q = flat.unflatten(request.query || {});
      if (!q.sortBy) {
        q.sortBy = sortBy;
        q.direction = 'desc';
      }
      request.query = flat.flatten(q);
      return request;
    };

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

      const active = await findActiveInviteForTopic(topicId);
      if (active) {
        throw new Error(
          'Bu mavzu uchun test hali ochiq. Avval «Testni tugatish», keyin yangi kod yarating.'
        );
      }

      const companyId = admin.role === 'company' ? admin.id : String(topic.companyOwner);
      const code = await generateUniqueInviteCode();

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

      const otherActive = await TopicInviteCode.findOne({
        topic: newTopicId,
        closedAt: null,
        _id: { $ne: recordId },
      }).lean();
      if (otherActive) {
        throw new Error('Bu mavzu uchun boshqa ochiq kod mavjud — avval uni tugating.');
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
        if (p.role && p.role !== 'company') {
          throw new Error('Siz o‘z rolingizni o‘zgartira olmaysiz!');
        }
        const allow = ['name', 'email', 'password', 'phone', 'companyLogo'];
        const next = {};
        allow.forEach((k) => {
          if (p[k] !== undefined) next[k] = p[k];
        });
        // Majburiy ravishda rolni company qilib saqlaymiz (agar adminjs bo'shatib yubormasligi uchun)
        next.role = 'company';
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
        await fs.unlink(file.path).catch(() => { });

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
      locale: adminUzLocale,
      resources: [
        {
          resource: Subject,
          options: {
            navigation: { name: null, icon: 'Book' },
            name: 'Fanlar',
            sort: { sortBy: 'createdAt', direction: 'desc' },
            titleProperty: 'name',
            listProperties: ['_id', 'name', 'companyOwner', 'description', 'createdAt'],
            editProperties: ['name', 'description'],
            showProperties: ['_id', 'name', 'companyOwner', 'description', 'createdAt', 'updatedAt'],
            filterProperties: ['name', 'companyOwner'],
            actions: {
              list: {
                isAccessible: adminOrCompany,
                before: async (request, context) =>
                  mergeCompanySubjectList(mergeNewestFirstSort(request), context.currentAdmin),
              },
              search: {
                isAccessible: adminOrCompany,
                before: async (request, context) =>
                  mergeCompanySubjectList(mergeNewestFirstSort(request), context.currentAdmin),
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
            navigation: { name: null, icon: 'Document' },
            name: 'Mavzular',
            sort: { sortBy: 'createdAt', direction: 'desc' },
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
                before: async (request, context) =>
                  mergeCompanyTopicList(mergeNewestFirstSort(request), context.currentAdmin),
              },
              search: {
                isAccessible: adminOrCompany,
                before: async (request, context) =>
                  mergeCompanyTopicList(mergeNewestFirstSort(request), context.currentAdmin),
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
                    const existing = await findActiveInviteForTopic(topicId);
                    return {
                      record: record.toJSON(currentAdmin),
                      meta: {
                        code: existing?.code || '',
                        status: inviteStatusLabel(existing),
                      },
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

                  const companyId =
                    currentAdmin?.role === 'company' ? currentAdmin.id : String(topic.companyOwner);

                  let invite;
                  const active = await findActiveInviteForTopic(topicId);
                  if (active) {
                    const code = await generateUniqueInviteCode(topicId);
                    invite = await TopicInviteCode.findByIdAndUpdate(
                      active._id,
                      { $set: { code } },
                      { new: true }
                    ).lean();
                  } else {
                    invite = await createInviteForTopic(topicId, companyId);
                  }

                  return {
                    notice: {
                      message: `Kirish kodi: ${invite.code} — foydalanuvchiga yuboring (mobil: 6 raqam).`,
                      type: 'success',
                    },
                    record: record.toJSON(currentAdmin),
                    meta: { code: invite.code, status: inviteStatusLabel(invite) },
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

                  const existingInv = await findActiveInviteForTopic(topicId);
                  if (!existingInv) {
                    return {
                      notice: {
                        message:
                          'Ochiq kod topilmadi — avval «6 raqamli kod» yarating yoki allaqachon tugatilgan.',
                        type: 'info',
                      },
                      record: record.toJSON(currentAdmin),
                    };
                  }

                  await closeInviteById(existingInv._id);

                  return {
                    notice: {
                      message:
                        'Test tugatildi (arxiv) — ishtirokchilar saqlanadi. Yangi raund: «6 raqamli kod» yoki «Test kirish kodlari» → «Yangi raund».',
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
            navigation: { name: null, icon: 'Key' },
            name: 'Test kodlari',
            sort: { sortBy: 'createdAt', direction: 'desc' },
            titleProperty: 'code',
            listProperties: ['code', 'topic', 'testStatus', 'closedAt', 'createdAt'],
            newProperties: ['topic'],
            editProperties: ['topic'],
            showProperties: ['code', 'topic', 'company', 'testStatus', 'closedAt', 'createdAt', 'updatedAt'],
            filterProperties: ['code', 'closedAt'],
            properties: {
              testStatus: {
                type: 'string',
                isVisible: { list: true, filter: false, show: true, edit: false, new: false },
                props: { disabled: true },
              },
              topic: {
                reference: 'Topic',
                isRequired: true,
                description:
                  'Shunchaki mavzuni tanlang. 6 raqamli kod avtomatik chiqadi; kompaniya ham mavzu orqali o‘zi bog‘lanadi — alohida tanlash yo‘q.',
              },
              closedAt: {
                description: 'Yopilgan vaqt (arxiv). Bo‘sh = «Davom etmoqda», mobil kod ishlaydi.',
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
                isAccessible: adminOrCompany,
                before: async (request, context) => {
                  let r = mergeNewestFirstSort(request);
                  if (context.currentAdmin?.role === 'company') {
                    r = mergeCompanyInviteList(r, context.currentAdmin);
                  }
                  return r;
                },
              },
              search: {
                isAccessible: adminOrCompany,
                before: async (request, context) => {
                  let r = mergeNewestFirstSort(request);
                  if (context.currentAdmin?.role === 'company') {
                    r = mergeCompanyInviteList(r, context.currentAdmin);
                  }
                  return r;
                },
              },
              show: {
                isAccessible: ({ currentAdmin, record }) => {
                  if (currentAdmin?.role === 'admin') return true;
                  return canCompanyOwnInviteRecord({ currentAdmin, record });
                },
              },
              participantsOverview: {
                actionType: 'record',
                icon: 'Users',
                label: 'Monitoring (ishtirokchilar)',
                showInDrawer: false,
                component: topicInviteMonitorComponent,
                isAccessible: ({ currentAdmin, record }) => {
                  if (currentAdmin?.role === 'admin') return true;
                  return canCompanyOwnInviteRecord({ currentAdmin, record });
                },
                handler: async (request, response, context) => {
                  const { record, currentAdmin } = context;
                  const inviteId = record?.params?._id;
                  if (!inviteId) {
                    return { notice: { message: 'Yozuv topilmadi', type: 'error' } };
                  }
                  const inv = await TopicInviteCode.findById(inviteId).lean();
                  if (!inv) {
                    return { notice: { message: 'Yozuv topilmadi', type: 'error' } };
                  }
                  if (
                    currentAdmin?.role === 'company' &&
                    String(inv.company) !== String(currentAdmin.id)
                  ) {
                    return { notice: { message: 'Ruxsat yoq', type: 'error' } };
                  }
                  const rows = await buildParticipantRowsForInvite(inv);
                  return {
                    record: record.toJSON(currentAdmin),
                    meta: {
                      rows,
                      closedAt: inv.closedAt || null,
                      code: inv.code,
                      testStatus: inviteStatusLabel(inv),
                      inviteId: String(inv._id),
                      topicId: String(inv.topic),
                      companyId: String(inv.company?._id || inv.company || ''),
                    },
                  };
                },
              },
              blockParticipant: {
                actionType: 'record',
                isVisible: false,
                isAccessible: adminOrCompany,
                handler: async (request, response, context) => {
                  const isPost = String(request.method || '').toLowerCase() === 'post';
                  if (!isPost) {
                    return { record: context.record?.toJSON?.(context.currentAdmin) };
                  }
                  const { record, currentAdmin } = context;
                  const userId = String(request.payload?.userId || '').trim();
                  if (!userId) {
                    return {
                      notice: { message: 'userId kerak', type: 'error' },
                      record: record.toJSON(currentAdmin),
                    };
                  }
                  let companyId =
                    normalizeRefId(record.params?.company) ||
                    (currentAdmin?.role === 'company' ? String(currentAdmin.id) : '');
                  if (!companyId && record?.params?._id) {
                    const invRow = await TopicInviteCode.findById(record.params._id).select('company').lean();
                    companyId = normalizeRefId(invRow?.company);
                  }
                  if (!companyId) {
                    return {
                      notice: { message: 'Kompaniya aniqlanmadi', type: 'error' },
                      record: record.toJSON(currentAdmin),
                    };
                  }
                  try {
                    await blockUserForCompany(userId, companyId, request.payload?.reason);
                    return {
                      notice: { message: 'Foydalanuvchi bloklandi', type: 'success' },
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
              unblockParticipant: {
                actionType: 'record',
                isVisible: false,
                isAccessible: adminOrCompany,
                handler: async (request, response, context) => {
                  const isPost = String(request.method || '').toLowerCase() === 'post';
                  if (!isPost) {
                    return { record: context.record?.toJSON?.(context.currentAdmin) };
                  }
                  const { record, currentAdmin } = context;
                  const userId = String(request.payload?.userId || '').trim();
                  if (!userId) {
                    return {
                      notice: { message: 'userId kerak', type: 'error' },
                      record: record.toJSON(currentAdmin),
                    };
                  }
                  let companyId =
                    normalizeRefId(record.params?.company) ||
                    (currentAdmin?.role === 'company' ? String(currentAdmin.id) : '');
                  if (!companyId && record?.params?._id) {
                    const invRow = await TopicInviteCode.findById(record.params._id).select('company').lean();
                    companyId = normalizeRefId(invRow?.company);
                  }
                  if (!companyId) {
                    return {
                      notice: { message: 'Kompaniya aniqlanmadi', type: 'error' },
                      record: record.toJSON(currentAdmin),
                    };
                  }
                  try {
                    await unblockUserForCompany(userId, companyId);
                    return {
                      notice: { message: 'Blok olib tashlandi', type: 'success' },
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
              createNewRound: {
                actionType: 'record',
                icon: 'Refresh',
                label: 'Yangi raund (yangi kod)',
                showInDrawer: false,
                isAccessible: ({ currentAdmin, record }) => {
                  if (!record?.params?.closedAt) return false;
                  if (currentAdmin?.role === 'admin') return true;
                  return canCompanyOwnInviteRecord({ currentAdmin, record });
                },
                handler: async (request, response, context) => {
                  const { record, currentAdmin } = context;
                  const topicId = normalizeRefId(record.params?.topic);
                  const companyId =
                    normalizeRefId(record.params?.company) ||
                    (currentAdmin?.role === 'company' ? String(currentAdmin.id) : '');
                  if (!topicId) {
                    return { notice: { message: 'Mavzu topilmadi', type: 'error' } };
                  }
                  try {
                    const created = await createInviteForTopic(topicId, companyId);
                    const root = context._admin.options.rootPath || '/admin';
                    return {
                      notice: {
                        message: `Yangi kod: ${created.code} — mobil ilovada shu kod bilan kiriladi.`,
                        type: 'success',
                      },
                      redirectUrl: `${root}/resources/TopicInviteCode/records/${created._id}/show`,
                    };
                  } catch (e) {
                    return {
                      notice: { message: e?.message || 'Xatolik', type: 'error' },
                      record: record.toJSON(currentAdmin),
                    };
                  }
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
                  await closeInviteById(id);
                  return {
                    notice: {
                      message:
                        'Test tugatildi (arxiv) — ma’lumotlar saqlanadi. Yangi kod: «Yangi raund» yoki mavzudan «6 raqamli kod».',
                      type: 'success',
                    },
                    record: context.record?.toJSON?.(currentAdmin),
                  };
                },
              },
              new: {
                isAccessible: adminOrCompany,
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
            navigation: { name: null, icon: 'User' },
            name: 'Foydalanuvchilar',
            sort: { sortBy: 'createdAt', direction: 'desc' },
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
                isVisible: {
                  list: true,
                  show: true,
                  filter: true,
                  edit: (context) => context?.currentAdmin?.role === 'admin',
                },
                availableValues: [
                  { value: 'user', label: 'User' },
                  { value: 'admin', label: 'Admin' },
                  { value: 'company', label: 'Kompaniya' },
                ],
              },
            },
            actions: {
              list: {
                before: async (request, context) =>
                  mergeCompanyListFilter(mergeNewestFirstSort(request), context.currentAdmin),
              },
              search: {
                before: async (request, context) =>
                  mergeCompanyListFilter(mergeNewestFirstSort(request), context.currentAdmin),
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
              myProfile: {
                actionType: 'resource',
                icon: 'Settings',
                label: 'Mening profilim (sozlamalar)',
                component: myProfileRedirectComponent,
                isAccessible: ({ currentAdmin }) => currentAdmin?.role === 'admin' || currentAdmin?.role === 'company',
                handler: async () => ({ meta: {} }),
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
        {
          resource: AdminMonitoringStub,
          options: {
            id: 'Monitoring',
            name: 'Monitoring',
            navigation: { name: null, icon: 'Activity' },
            listProperties: [],
            filterProperties: [],
            properties: {},
            actions: {
              list: {
                component: testMonitoringPageComponent,
                isAccessible: ({ currentAdmin }) =>
                  currentAdmin?.role === 'admin' || currentAdmin?.role === 'company',
                handler: async () => ({ records: [], meta: { total: 0, perPage: 10, page: 1 } }),
              },
              show: { isAccessible: () => false },
              new: { isAccessible: () => false },
              edit: { isAccessible: () => false },
              delete: { isAccessible: () => false },
              bulkDelete: { isAccessible: () => false },
              search: { isAccessible: () => false },
            },
          },
        },
        {
          resource: AdminHabarStub,
          options: {
            id: 'Habar',
            name: 'Habar',
            navigation: { name: null, icon: 'Bell' },
            listProperties: [],
            filterProperties: [],
            properties: {},
            actions: {
              list: {
                component: habarPageComponent,
                isAccessible: ({ currentAdmin }) =>
                  currentAdmin?.role === 'admin' || currentAdmin?.role === 'company',
                handler: async () => ({ records: [], meta: { total: 0, perPage: 10, page: 1 } }),
              },
              show: { isAccessible: () => false },
              new: { isAccessible: () => false },
              edit: { isAccessible: () => false },
              delete: { isAccessible: () => false },
              bulkDelete: { isAccessible: () => false },
              search: { isAccessible: () => false },
            },
          },
        },
      ],
      branding: {
        companyName: 'RIVOQ-TEST',
        logo: false,
        withMadeWithLove: false,
        favicon: process.env.ADMIN_BRAND_FAVICON || undefined,
      },
    });

    // AdminJS dev rejimida `.adminjs/bundle.js` keshi ba’zan yangi ComponentLoader komponentlarini
    // o‘z ichiga olmaydi — CompanyLogoUpload kabi xatolarni oldini olish uchun keshni yo‘q qilamiz.
    if (process.env.NODE_ENV !== 'production') {
      void fs
        .unlink(path.join(process.cwd(), '.adminjs', 'bundle.js'))
        .catch(() => { });
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

    adminRouter.use((req, _res, next) => {
      if (req.session && !req.session.adminUser && req.session.admin) {
        req.session.adminUser = req.session.admin;
      }
      next();
    });

    attachAdminWalletGrantRoutes(adminRouter);
    attachCompanyTestRoutes(adminRouter);
    attachMonitoringRoutes(adminRouter);
    attachHabarRoutes(adminRouter);

    await ensureTopicInviteIndexes();

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
