import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { WalletTransaction } from '../models/WalletTransaction.js';
import { Notification } from '../models/Notification.js';

const MAX_PER_FIELD = Number(process.env.ADMIN_WALLET_GRANT_MAX || 999_999);

function currentAdmin(req) {
  return req.session?.adminUser || null;
}

/** Faqat `role=admin` AdminJS akkaunti. */
function canGrantWallet(adm) {
  return !!adm && adm.role === 'admin';
}

/** formidable (multipart/urlencoded) qiyin formatlarni yumshoq o‘qiymiz */
function pickField(fields, body, key) {
  const src = { ...(fields && typeof fields === 'object' ? fields : {}), ...(body && typeof body === 'object' ? body : {}) };
  let v = src[key];
  if (Array.isArray(v)) v = v.length ? v[0] : '';
  if (v && typeof v === 'object' && 'value' in v) v = v.value;
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

/** Custom route’lar `buildAuthenticatedRouter` dan keyin qo‘shiladi — session allaqachon bor. */
export function attachAdminWalletGrantRoutes(adminRouter) {
  adminRouter.get('/custom/wallet-grant/users', async (req, res, next) => {
    try {
      const adm = currentAdmin(req);
      if (!adm) return res.status(401).json({ ok: false, message: 'Admin panelda kiring.' });
      if (!canGrantWallet(adm)) return res.status(403).json({ ok: false, message: 'Faqat admin roli coin va score berishi mumkin.' });

      const users = await User.find({})
        .select('name email role coins score isActive')
        .sort({ name: 1 })
        .limit(4000)
        .lean();

      return res.json({
        ok: true,
        users: users.map((u) => ({
          id: String(u._id),
          name: u.name || '',
          email: u.email || '',
          role: u.role || 'user',
          coins: Number(u.coins) || 0,
          score: Number(u.score) || 0,
          isActive: u.isActive !== false,
        })),
      });
    } catch (e) {
      return next(e);
    }
  });

  adminRouter.post('/custom/wallet-grant', async (req, res, next) => {
    try {
      const adm = currentAdmin(req);
      if (!adm) return res.status(401).json({ ok: false, message: 'Admin panelda kiring.' });
      if (!canGrantWallet(adm)) return res.status(403).json({ ok: false, message: 'Faqat admin roli coin va score berishi mumkin.' });

      const targetUserId = pickField(req.fields, req.body, 'targetUserId');
      const addCoins = Math.min(MAX_PER_FIELD, Math.max(0, Math.floor(Number(pickField(req.fields, req.body, 'addCoins')) || 0)));
      const addScore = Math.min(MAX_PER_FIELD, Math.max(0, Math.floor(Number(pickField(req.fields, req.body, 'addScore')) || 0)));

      if (!mongoose.isValidObjectId(targetUserId)) {
        return res.status(400).json({
          ok: false,
          message: targetUserId
            ? 'Foydalanuvchi ID formati noto‘g‘ri.'
            : 'Ma’lumotlar yetib kelmadi. Foydalanuvchini tanlang va qayta «Qo‘llash».',
        });
      }
      if (addCoins <= 0 && addScore <= 0) {
        return res.status(400).json({ ok: false, message: 'Kamida bittasi: coin yoki score 1 dan katta bo‘lsin' });
      }

      const target = await User.findById(targetUserId);
      if (!target) return res.status(404).json({ ok: false, message: 'Foydalanuvchi topilmadi' });

      if (addCoins) target.coins = Math.max(0, (Number(target.coins) || 0) + addCoins);
      if (addScore) target.score = Math.max(0, (Number(target.score) || 0) + addScore);
      await target.save();

      const txs = [];
      if (addCoins > 0) {
        txs.push({
          user: target._id,
          kind: 'coin',
          amount: addCoins,
          reason: 'admin_wallet_grant',
          meta: {
            byAdminEmail: adm.email ? String(adm.email).slice(0, 320) : null,
            byAdminId: adm.id != null ? String(adm.id).slice(0, 64) : null,
          },
        });
      }
      if (addScore > 0) {
        txs.push({
          user: target._id,
          kind: 'score',
          amount: addScore,
          reason: 'admin_wallet_grant',
          meta: {
            byAdminEmail: adm.email ? String(adm.email).slice(0, 320) : null,
            byAdminId: adm.id != null ? String(adm.id).slice(0, 64) : null,
          },
        });
      }

      let walletTransactionIds = [];
      if (txs.length) {
        try {
          const docs = await WalletTransaction.insertMany(txs);
          walletTransactionIds = docs.map((d) => String(d._id));
        } catch (e) {
          console.error('[admin_wallet_grant] WalletTransaction/yozilmadi:', e?.message || e);
        }
      }

      try {
        const parts = [];
        if (addCoins > 0) parts.push(`+${addCoins} coin`);
        if (addScore > 0) parts.push(`+${addScore} score`);
        const summary = parts.join(' va ');
        await Notification.create({
          user: target._id,
          type: 'gift',
          title: 'Coin va score qo‘shildi',
          body: `${summary}. «Hamyon» tarixida «Platforma sovg‘asi» sifatida ko‘rinadi; balans: ${target.coins} coin · ${target.score} score.`,
          data: {
            screen: 'Wallet',
            giftKind: 'admin_wallet',
            reasonCode: 'admin_wallet_grant',
            walletTransactionIds,
            coinsAdded: addCoins,
            scoreAdded: addScore,
            newCoins: target.coins,
            newScore: target.score,
          },
        });
      } catch {
        /* bildirishnoma bo‘lmasa ham balans qo‘llandi */
      }

      return res.json({
        ok: true,
        message: 'Muvaffaqiyatli qo‘llandi',
        target: {
          id: String(target._id),
          name: target.name,
          email: target.email,
          coins: target.coins,
          score: target.score,
        },
        granted: { coins: addCoins, score: addScore },
      });
    } catch (e) {
      return next(e);
    }
  });
}
