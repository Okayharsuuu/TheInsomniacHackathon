const express = require('express');
const cors = require('cors');
const db = require('./database.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// API: Register User
app.post('/api/auth/register', (req, res) => {
    const { username, password, region } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    const sql = 'INSERT INTO users (username, password, region) VALUES (?, ?, ?)';
    db.run(sql, [username, password, region || 'Global'], function (err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(400).json({ error: 'Username already exists' });
            }
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ message: 'User registered successfully', id: this.lastID });
    });
});

// API: Login User
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    const sql = 'SELECT * FROM users WHERE username = ? AND password = ?';
    db.get(sql, [username, password], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(401).json({ error: 'Invalid username or password' });

        // Update last login
        db.run('UPDATE users SET last_login = ? WHERE id = ?', [new Date().toISOString(), user.id]);

        // Return user data (excluding password)
        const { password: _, ...userData } = user;
        res.json({ message: 'Login successful', user: userData });
    });
});

// API: Get Leaderboard by Region
app.get('/api/leaderboard', (req, res) => {
    // If region is 'Global', we fetch across all regions.
    const region = req.query.region || 'Global';

    let sql = 'SELECT id, username, region, total_points, longest_streak, avatar FROM users ORDER BY total_points DESC LIMIT 50';
    let params = [];

    if (region !== 'Global') {
        sql = 'SELECT id, username, region, total_points, longest_streak, avatar FROM users WHERE region = ? ORDER BY total_points DESC LIMIT 50';
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
    const { username, points, longestStreak, daysMet, avatar } = req.body;

    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }

    // Since users must be logged in now, we only UPDATE.
    const sql = `UPDATE users SET 
                    total_points = ?,
                    longest_streak = ?,
                    days_met = ?,
                    avatar = ?
                 WHERE username = ?`;

    db.run(sql, [points, longestStreak, daysMet, avatar, username], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'User not found' });
        res.json({ message: 'User data synced successfully' });
    });
});

// Start listening
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`FocusFuel Backend running on port ${port}`);
    console.log(`Frontend served at: http://localhost:${port}`);
});
