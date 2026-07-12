'use strict';

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Sprint slot schedule per weekend:
 *
 *  Friday    18:00  – Kickoff call
 *  Saturday  09:00  – Sprint start
 *  Saturday  14:00  – Sprint afternoon check-in
 *  Sunday    10:00  – Final build
 *  Sunday    17:00  – Deploy & handover
 */
const WEEKEND_SLOTS = [
  { dayOffset: 0, time: '18:00', label: 'Friday Kickoff' },
  { dayOffset: 1, time: '09:00', label: 'Saturday Sprint Start' },
  { dayOffset: 1, time: '14:00', label: 'Saturday Afternoon' },
  { dayOffset: 2, time: '10:00', label: 'Sunday Final Build' },
  { dayOffset: 2, time: '17:00', label: 'Sunday Deploy & Handover' },
];

/** Return the date string YYYY-MM-DD for a given Date object (local date, no tz shift) */
function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Find the first Friday on or after `from` date */
function firstFriday(from) {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  // getDay(): 0=Sun,1=Mon,...,5=Fri,6=Sat
  const daysUntilFriday = (5 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + daysUntilFriday);
  return d;
}

async function seedYear() {
  console.log('🌱  Seeding sprint slots for all 2026 weekends into Neon DB…\n');

  // Seed from today through 31 Dec 2026
  const start = new Date();             // today
  const end   = new Date('2026-12-31');

  const slots = [];

  let friday = firstFriday(start);
  while (friday <= end) {
    for (const { dayOffset, time, label } of WEEKEND_SLOTS) {
      const d = new Date(friday);
      d.setDate(d.getDate() + dayOffset);
      if (d > end) continue;
      slots.push({ date: toDateStr(d), time, label });
    }
    friday.setDate(friday.getDate() + 7); // next Friday
  }

  console.log(`📆  Generated ${slots.length} slots across ${Math.round(slots.length / WEEKEND_SLOTS.length)} weekends\n`);

  let inserted = 0;
  let skipped  = 0;

  for (const { date, time } of slots) {
    const result = await pool.query(
      `INSERT INTO available_slots (date, time, is_available)
       VALUES ($1, $2, true)
       ON CONFLICT (date, time) DO NOTHING
       RETURNING id`,
      [date, time]
    );
    if (result.rowCount > 0) inserted++;
    else skipped++;
  }

  console.log(`✅  Inserted : ${inserted} new slots`);
  console.log(`⏭️   Skipped  : ${skipped} (already existed)\n`);

  // Pretty-print the next 20 available dates
  const preview = await pool.query(`
    SELECT date::text AS date,
           array_agg(time::text ORDER BY time) AS times
    FROM   available_slots
    WHERE  is_available = true
      AND  date >= CURRENT_DATE
    GROUP  BY date
    ORDER  BY date
    LIMIT  20
  `);

  console.log('📅  Next 20 available sprint dates:');
  console.log('──────────────────────────────────────────');
  preview.rows.forEach(r => {
    const times = r.times.map(t => t.slice(0, 5)).join('  │  ');
    console.log(`   ${r.date}   ${times}`);
  });
  console.log('──────────────────────────────────────────');
  console.log(`\n🚀  Done! ${preview.rows.length} upcoming dates ready for booking.\n`);
}

seedYear()
  .catch(err => { console.error('❌  Seed failed:', err.message); process.exit(1); })
  .finally(() => pool.end());
