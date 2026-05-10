import fs from 'fs/promises';
import path from 'path';
import AdminJS, { ComponentLoader, flat } from 'adminjs';
import AdminJSExpress from '@adminjs/express';
import * as AdminJSMongoose from '@adminjs/mongoose';
import bcryptjs from 'bcryptjs';
import { User } from '../models/User.js';
import { Subject } from '../models/Subject.js';
import { Topic } from '../models/Topic.js';
import { Question } from '../models/Question.js';
import { Notification } from '../models/Notification.js';

AdminJS.registerAdapter({
  Database: AdminJSMongoose.Database,
  Resource: AdminJSMongoose.Resource,
});

export const setupAdmin = (app) => {
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

    const companyLogoUploadDir = path.join(process.cwd(), 'public', 'uploads', 'company-logos');

    const onlyAdmin = ({ currentAdmin }) => currentAdmin?.role === 'admin';

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
      resources: [
        {
          resource: Subject,
          options: {
            navigation: { name: 'Test yaratish' },
            name: 'Fan',
            titleProperty: 'name',
            listProperties: ['_id', 'name', 'description', 'createdAt'],
            editProperties: ['name', 'description'],
            showProperties: ['_id', 'name', 'description', 'createdAt', 'updatedAt'],
            filterProperties: ['name'],
            actions: {
              list: { isAccessible: onlyAdmin },
              search: { isAccessible: onlyAdmin },
              show: { isAccessible: onlyAdmin },
              new: { isAccessible: onlyAdmin },
              edit: { isAccessible: onlyAdmin },
              delete: { isAccessible: onlyAdmin },
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
            listProperties: ['_id', 'subject', 'name', 'difficulty', 'minutes', 'questionCount', 'createdAt'],
            editProperties: ['subject', 'name', 'description', 'minutes', 'difficulty'],
            showProperties: ['_id', 'subject', 'name', 'description', 'difficulty', 'minutes', 'questionCount', 'questionsInline', 'createdAt', 'updatedAt'],
            filterProperties: ['subject', 'name', 'difficulty'],
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
              list: { isAccessible: onlyAdmin },
              search: { isAccessible: onlyAdmin },
              show: { isAccessible: onlyAdmin },
              new: { isAccessible: onlyAdmin },
              edit: { isAccessible: onlyAdmin },
              delete: { isAccessible: onlyAdmin },
              bulkDelete: { isAccessible: onlyAdmin },
              addQuestion: {
                isAccessible: onlyAdmin,
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
                isAccessible: onlyAdmin,
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
                isAccessible: onlyAdmin,
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
                isAccessible: onlyAdmin,
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
                  'Kompaniya akkauntining MongoDB ID si: qaysi kompaniyaga tegishli oddiy foydalanuvchi ekanini ko‘rsatadi. Kompaniya o‘zi foydalanuvchi yaratganda avtomatik to‘ldiriladi; kompaniya (role=company) akkauntida bo‘sh qoldiring.',
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
                isAccessible: ({ currentAdmin }) =>
                  currentAdmin?.role === 'admin' || currentAdmin?.role === 'company',
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
    }

    const ADMIN_PANEL_PASSWORD = process.env.ADMIN_PANEL_PASSWORD || '123123';
    const DEFAULT_ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || 'admin@rivoq.com').toLowerCase();

    // Ensure there is at least one active admin user for panel login.
    // Panel password is separate (ADMIN_PANEL_PASSWORD).
    (async () => {
      try {
        const existing = await User.findOne({ email: DEFAULT_ADMIN_EMAIL });
        if (!existing) {
          await User.create({
            name: 'Admin',
            email: DEFAULT_ADMIN_EMAIL,
            phone: '',
            password: Math.random().toString(36).slice(-10),
            role: 'admin',
            isActive: true,
          });
          console.log('✓ Default admin user created:', DEFAULT_ADMIN_EMAIL);
        } else if (existing.role !== 'admin' || existing.isActive === false) {
          await User.updateOne({ _id: existing._id }, { $set: { role: 'admin', isActive: true } });
          console.log('✓ Default admin user ensured:', DEFAULT_ADMIN_EMAIL);
        }
      } catch (e) {
        console.error('Failed to ensure default admin user:', e?.message || e);
      }
    })();

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
      }
    );

    adminRouter.post('/upload/company-logo', handleCompanyLogoUpload);

    app.use(admin.options.rootPath, adminRouter);

    return admin;
  } catch (error) {
    console.error('Admin panel setup error:', error);
    return null;
  }
};
