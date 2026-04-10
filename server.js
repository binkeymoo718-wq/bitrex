require('dotenv').config();
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const session = require('express-session');

const app = express();
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: 'bitrex_core_session_99',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // 24 hours
}));

const CITY_DATA = {
    'CITY A': { cost: 1500, tasks: 1, daily: 50 },
    'CITY B': { cost: 3200, tasks: 2, daily: 100 },
    'CITY C': { cost: 7200, tasks: 4, daily: 200 },
    'CITY D': { cost: 12000, tasks: 8, daily: 400 },
    'CITY E': { cost: 15000, tasks: 10, daily: 500 }
};

// Middleware
const auth = (req, res, next) => req.session.userId ? next() : res.redirect('/login');

// Routes
app.get('/', auth, async (req, res) => {
    try {
        const u = await pool.query('SELECT * FROM users WHERE id = $1', [req.session.userId]);
        const c = await pool.query('SELECT city_name FROM investments WHERE user_id = $1', [req.session.userId]);
        res.render('index', { user: u.rows[0], activeCities: c.rows.map(r => r.city_name) });
    } catch (e) { res.redirect('/login'); }
});

app.get('/login', (req, res) => res.render('login'));
app.get('/signup', (req, res) => res.render('signup'));
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE phone = $1 AND password = $2', [phone, password]);
    if (result.rows.length) {
        req.session.userId = result.rows[0].id;
        res.redirect('/');
    } else { res.send('<script>alert("Invalid details"); window.location="/login";</script>'); }
});

app.post('/signup', async (req, res) => {
    const { phone, email, password, referral } = req.body;
    const refCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    try {
        await pool.query('INSERT INTO users (phone, email, password, referral_code, invited_by, balance, today_income) VALUES ($1, $2, $3, $4, $5, 0, 0)', 
        [phone, email, password, refCode, referral || null]);
        res.redirect('/login');
    } catch (e) { res.send("Signup failed. Phone exists."); }
});

app.post('/do-task', auth, async (req, res) => {
    const uid = req.session.userId;
    const userInv = await pool.query('SELECT city_name FROM investments WHERE user_id = $1', [uid]);
    if (!userInv.rows.length) return res.json({ success: false, msg: "No active city investment!" });
    
    let maxTasks = 0;
    userInv.rows.forEach(r => maxTasks += CITY_DATA[r.city_name].tasks);
    
    const todayCount = await pool.query('SELECT COUNT(*) FROM transactions WHERE user_id = $1 AND type = \'TASK\' AND created_at > CURRENT_DATE', [uid]);
    if (parseInt(todayCount.rows[0].count) >= maxTasks) return res.json({ success: false, msg: "number of task limit reached" });

    await pool.query('UPDATE users SET balance = balance + 50, today_income = today_income + 50 WHERE id = $1', [uid]);
    await pool.query('INSERT INTO transactions (user_id, amount, type) VALUES ($1, 50, \'TASK\')', [uid]);
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`BITREX active on ${PORT}`));
