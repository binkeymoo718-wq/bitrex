require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const session = require('express-session');
const path = require('path');

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL }); // Connects to Supabase

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
    secret: 'bitrex_secret_key',
    resave: false,
    saveUninitialized: false
}));

// --- Configuration ---
const CITIES = {
    'CITY A': { cost: 1500, tasks: 1, daily: 50 },
    'CITY B': { cost: 3200, tasks: 2, daily: 100 },
    'CITY C': { cost: 7200, tasks: 4, daily: 200 },
    'CITY D': { cost: 12000, tasks: 8, daily: 400 },
    'CITY E': { cost: 15000, tasks: 10, daily: 500 }
};

// Middleware to check auth
const isAuth = (req, res, next) => req.session.userId ? next() : res.redirect('/login');

// --- Routes ---

app.get('/', isAuth, async (req, res) => {
    const user = await pool.query('SELECT * FROM users WHERE id = $1', [req.session.userId]);
    const investments = await pool.query('SELECT city_name FROM investments WHERE user_id = $1', [req.session.userId]);
    res.render('index', { user: user.rows[0], activeCities: investments.rows.map(r => r.city_name) });
});

app.get('/signup', (req, res) => res.render('signup'));
app.post('/signup', async (req, res) => {
    const { phone, email, password, referral } = req.body;
    const refCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    try {
        await pool.query(
            'INSERT INTO users (phone, email, password, referral_code, invited_by) VALUES ($1, $2, $3, $4, $5)',
            [phone, email, password, refCode, referral]
        );
        res.redirect('/login');
    } catch (e) { res.send("Error during signup."); }
});

app.get('/login', (req, res) => res.render('login'));
app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    const user = await pool.query('SELECT * FROM users WHERE phone = $1 AND password = $2', [phone, password]);
    if (user.rows.length) {
        req.session.userId = user.rows[0].id;
        res.redirect('/');
    } else { res.send("Invalid credentials."); }
});

// Task Processing Logic
app.post('/do-task', isAuth, async (req, res) => {
    const userId = req.session.userId;
    const userInv = await pool.query('SELECT city_name FROM investments WHERE user_id = $1', [userId]);
    
    if (userInv.rows.length === 0) return res.json({ success: false, msg: "Join a city first!" });

    let maxTasks = 0;
    userInv.rows.forEach(r => maxTasks += CITIES[r.city_name].tasks);

    const today = await pool.query('SELECT COUNT(*) FROM transactions WHERE user_id = $1 AND type = $2 AND created_at > CURRENT_DATE', [userId, 'TASK']);
    
    if (parseInt(today.rows[0].count) >= maxTasks) {
        return res.json({ success: false, msg: "Number of task limit reached" });
    }

    await pool.query('UPDATE users SET balance = balance + 50, today_income = today_income + 50 WHERE id = $1', [userId]);
    await pool.query('INSERT INTO transactions (user_id, amount, type) VALUES ($1, 50, $2)', [userId, 'TASK']);
    
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`BITREX running on ${PORT}`));
