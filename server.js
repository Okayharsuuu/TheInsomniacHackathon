const express = require('express');
const path = require('path');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

// Database Initialization
const db = new sqlite3.Database(path.join(__dirname, 'focusfuel.db'), (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        // Create tables if they don't exist
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                total_points INTEGER DEFAULT 0,
                longest_streak INTEGER DEFAULT 0,
                days_met INTEGER DEFAULT 0,
                avatar TEXT DEFAULT 'fa-user-astronaut',
                region TEXT DEFAULT 'Global',
                last_login TEXT
            )`);

            db.run(`ALTER TABLE users ADD COLUMN name TEXT DEFAULT 'Focus User'`, (err) => { });
            db.run(`ALTER TABLE users ADD COLUMN region TEXT DEFAULT 'Global'`, (err) => { });
            db.run(`ALTER TABLE users ADD COLUMN total_points INTEGER DEFAULT 0`, (err) => { });
            db.run(`ALTER TABLE users ADD COLUMN longest_streak INTEGER DEFAULT 0`, (err) => { });
            db.run(`ALTER TABLE users ADD COLUMN days_met INTEGER DEFAULT 0`, (err) => { });
            db.run(`ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT 'fa-user-astronaut'`, (err) => { });
            db.run(`ALTER TABLE users ADD COLUMN last_login TEXT`, (err) => { });
        });
    }
});

// ---- API Endpoints ----

// Register
app.post('/api/register', (req, res) => {
    const { name, username, email, password, region = 'Global' } = req.body;
    if (!name || !username || !email || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    const query = `INSERT INTO users (name, username, email, password, region) VALUES (?, ?, ?, ?, ?)`;
    db.run(query, [name, username, email, password, region], function (err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(409).json({ error: 'Username or Email already exists' });
            }
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ message: 'User registered successfully', userId: this.lastID });
    });
});

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    const query = `SELECT * FROM users WHERE username = ? AND password = ?`;
    db.get(query, [username, password], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        // Update last login
        db.run(`UPDATE users SET last_login = ? WHERE id = ?`, [new Date().toISOString(), user.id]);

        // Remove password from response
        const { password, ...userWithoutPassword } = user;
        res.json({ message: 'Login successful', user: userWithoutPassword });
    });
});

// Sync Data
app.post('/api/sync', (req, res) => {
    const { username, total_points, longest_streak, days_met } = req.body;
    if (!username) return res.status(400).json({ error: 'Username is required' });

    const query = `UPDATE users SET total_points = ?, longest_streak = ?, days_met = ? WHERE username = ?`;
    db.run(query, [total_points, longest_streak, days_met, username], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Data synced successfully' });
    });
});

// Leaderboard
app.get('/api/leaderboard', (req, res) => {
    const { region } = req.query;
    let query = `SELECT name, username, total_points, longest_streak, avatar, region FROM users`;
    let params = [];

    if (region && region !== 'Global') {
        query += ` WHERE region = ?`;
        params.push(region);
    }

    query += ` ORDER BY total_points DESC LIMIT 50`;

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Simple API point to check server status
app.get('/api/status', (req, res) => {
    res.json({ status: 'FocusFuel Server is Running', time: new Date() });
});

// Fallback to index.html for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
