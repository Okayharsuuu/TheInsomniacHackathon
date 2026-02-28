const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Initialize database
const dbPath = path.resolve(__dirname, 'focusfuel.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');

        // Create profiles table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            region TEXT,
            total_points INTEGER DEFAULT 0,
            longest_streak INTEGER DEFAULT 0,
            days_met INTEGER DEFAULT 0,
            avatar TEXT DEFAULT 'fa-user-astronaut',
            last_login DATETIME
        )`, (err) => {
            if (err) {
                console.error("Error creating users table", err.message);
            } else {
                console.log("Users table ready.");
                // Migration: Add columns if they don't exist (handle cases where table already existed)
                const columns = [
                    { name: 'password', type: 'TEXT' },
                    { name: 'days_met', type: 'INTEGER DEFAULT 0' },
                    { name: 'last_login', type: 'DATETIME' }
                ];
                columns.forEach(col => {
                    db.run(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`, (alterErr) => {
                        if (alterErr && !alterErr.message.includes('duplicate column name')) {
                            console.error(`Error migrating column ${col.name}:`, alterErr.message);
                        }
                    });
                });
                seedDatabase();
            }
        });
    }
});

// Seed mock data for leaderboard if empty
function seedDatabase() {
    db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
        if (!err && row.count === 0) {
            console.log('Seeding initial leaderboard data...');

            const seedData = [
                ['Alex T.', 'Global', 1250, 14, 'fa-user-ninja'],
                ['Sarah M.', 'North America', 980, 10, 'fa-user-graduate'],
                ['David K.', 'Asia', 840, 8, 'fa-user-tie'],
                ['Mike R.', 'North America', 650, 7, 'fa-user-astronaut'],
                ['Emma W.', 'North America', 420, 4, 'fa-user-doctor'],
                ['Liam P.', 'Europe', 530, 6, 'fa-user-secret'],
                ['Yuki S.', 'Asia', 720, 9, 'fa-user-astronaut']
            ];

            const stmt = db.prepare('INSERT INTO users (username, region, total_points, longest_streak, avatar) VALUES (?, ?, ?, ?, ?)');
            seedData.forEach(user => stmt.run(user));
            stmt.finalize();
        }
    });
}

module.exports = db;
