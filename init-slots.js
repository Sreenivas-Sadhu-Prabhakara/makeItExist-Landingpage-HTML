const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * Initialize available sprint slots for the next 12 weeks
 * Adds Friday 6 PM, Saturday 10 AM, and Saturday 2 PM for each weekend
 */
async function initializeSlots() {
  try {
    console.log('🚀 Initializing sprint slots...');

    const slots = [];
    const today = new Date();
    
    // Generate slots for next 12 weeks (fridays to sundays)
    for (let i = 0; i < 12; i++) {
      const nextFriday = new Date(today);
      nextFriday.setDate(today.getDate() + (5 - today.getDay() + 7 * i));
      
      // Friday 6 PM - Kickoff
      const fridayDate = nextFriday.toISOString().split('T')[0];
      slots.push({ date: fridayDate, time: '18:00', description: 'Kickoff' });
      
      // Saturday 10 AM & 2 PM - Sprint day
      const saturdayDate = new Date(nextFriday);
      saturdayDate.setDate(saturdayDate.getDate() + 1);
      const satDate = saturdayDate.toISOString().split('T')[0];
      slots.push({ date: satDate, time: '10:00', description: 'Sprint Morning' });
      slots.push({ date: satDate, time: '14:00', description: 'Sprint Afternoon' });
      
      // Sunday 6 PM - Final Check & Deploy
      const sundayDate = new Date(nextFriday);
      sundayDate.setDate(sundayDate.getDate() + 2);
      const sunDate = sundayDate.toISOString().split('T')[0];
      slots.push({ date: sunDate, time: '18:00', description: 'Deploy & Handover' });
    }

    // Insert slots
    for (const slot of slots) {
      try {
        await pool.query(
          'INSERT INTO available_slots (date, time) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [slot.date, slot.time]
        );
      } catch (err) {
        if (err.code !== '23505') { // Ignore unique constraint violations
          console.error(`Error inserting slot ${slot.date} ${slot.time}:`, err.message);
        }
      }
    }

    console.log(`✅ Added ${slots.length} sprint slots`);
    
    // Show upcoming slots
    const result = await pool.query(
      `SELECT date, array_agg(time ORDER BY time) as times 
       FROM available_slots 
       WHERE is_available = true AND date >= CURRENT_DATE
       GROUP BY date 
       ORDER BY date 
       LIMIT 10`
    );

    console.log('\n📅 Next 10 available dates:');
    result.rows.forEach(row => {
      console.log(`   ${row.date}: ${row.times.join(', ')}`);
    });

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
}

initializeSlots();
