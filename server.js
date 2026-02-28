const express = require('express');
const cors = require('cors');
const db = require('./database.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// API: Get Leaderboard by Region
app.get('/api/leaderboard', (req, res) => {
    // If region is 'Global', we fetch across all regions.
    const region = req.query.region || 'Global';

    let sql = 'SELECT * FROM users ORDER BY total_points DESC LIMIT 50';
    let params = [];

    if (region !== 'Global') {
        sql = 'SELECT * FROM users WHERE region = ? ORDER BY total_points DESC LIMIT 50';
        params = [region];
    }

    db.all(sql, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ region: region, leaderboard: rows });
        }
    });
});

// API: Sync/Update User Score
app.post('/api/users/sync', (req, res) => {
    // Expected Payload: { username, region, points, longestStreak, avatar }
    const { username, region, points, longestStreak, avatar } = req.body;

    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }

    // Upsert logic: IF user exists, update score (only if higher than current) and streak. ELSE create user.
    db.get('SELECT id, total_points, longest_streak FROM users WHERE username = ?', [username], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });

        if (row) {
            // User exists, Update points (adding new points) and replace longest streak if new one is higher
            const sql = `UPDATE users SET 
                            total_points = ?,
                            longest_streak = ?,
                            region = ?,
                            avatar = ?
                         WHERE id = ?`;

            const newStreak = Math.max(row.longest_streak, longestStreak || 0);

            db.run(sql, [points, newStreak, region, avatar, row.id], function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'User updated successfully', points: points, streak: newStreak });
            });
        } else {
            // New User
            const sql = 'INSERT INTO users (username, region, total_points, longest_streak, avatar) VALUES (?, ?, ?, ?, ?)';
            db.run(sql, [username, region || 'Global', points || 0, longestStreak || 0, avatar || 'fa-user-astronaut'], function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.status(201).json({ message: 'User created successfully', id: this.lastID });
            });
        }
    });
});

// Start listening
app.listen(PORT, () => {
    console.log(`FocusFuel Backend running on http://localhost:${PORT}`);
    console.log(`Test APi at: http://localhost:${PORT}/api/leaderboard`);
});
