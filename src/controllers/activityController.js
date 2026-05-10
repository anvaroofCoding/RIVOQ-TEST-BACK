import StatusCodes from 'http-status-codes';
import { asyncHandler } from '../utils/validators.js';
import { TestSession } from '../models/TestSession.js';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function daysInMonthUTC(year, month1to12) {
  const m0 = month1to12 - 1;
  // day 0 of next month => last day of current month
  const last = new Date(Date.UTC(year, m0 + 1, 0));
  return last.getUTCDate();
}

function levelFromCount(count) {
  // GitHub-like discrete levels (0 = no activity / red)
  if (!count) return 0;
  if (count >= 10) return 4;
  if (count >= 7) return 3;
  if (count >= 4) return 2;
  return 1;
}

export const heatmapMonth = asyncHandler(async (req, res) => {
  const now = new Date();
  const yearRaw = typeof req.query?.year === 'string' ? Number(req.query.year) : Number(req.query?.year);
  const monthRaw = typeof req.query?.month === 'string' ? Number(req.query.month) : Number(req.query?.month);

  const year = Number.isFinite(yearRaw) && yearRaw >= 2000 && yearRaw <= 2100 ? Math.floor(yearRaw) : now.getUTCFullYear();
  const month = Number.isFinite(monthRaw) && monthRaw >= 1 && monthRaw <= 12 ? Math.floor(monthRaw) : now.getUTCMonth() + 1;

  const dim = daysInMonthUTC(year, month);
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, dim, 23, 59, 59, 999));

  const agg = await TestSession.aggregate([
    {
      $match: {
        user: req.user._id,
        status: 'finished',
        finishedAt: { $gte: start, $lte: end },
      },
    },
    {
      $project: {
        day: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$finishedAt',
            timezone: 'UTC',
          },
        },
      },
    },
    { $group: { _id: '$day', count: { $sum: 1 } } },
  ]);

  const countByDay = new Map(agg.map((x) => [String(x._id), Number(x.count || 0)]));

  const days = [];
  for (let d = 1; d <= dim; d += 1) {
    const date = `${year}-${pad2(month)}-${pad2(d)}`;
    const count = countByDay.get(date) || 0;
    const level = levelFromCount(count);
    days.push({
      date,
      count,
      level, // 0..4 (frontend maps to colors)
      // convenience hints (optional)
      colorHint: level === 0 ? 'red' : 'green',
    });
  }

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      year,
      month,
      timezone: 'UTC',
      legend: {
        levels: [
          { level: 0, minCount: 0, maxCount: 0, meaning: 'no_tests' },
          { level: 1, minCount: 1, maxCount: 3, meaning: 'low' },
          { level: 2, minCount: 4, maxCount: 6, meaning: 'medium' },
          { level: 3, minCount: 7, maxCount: 9, meaning: 'high' },
          { level: 4, minCount: 10, maxCount: null, meaning: 'max' },
        ],
      },
      days,
    },
  });
});
