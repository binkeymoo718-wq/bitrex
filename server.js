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
    secret: 'bitrex_ultra_secret',
    resave: false,
    saveUninitialized: false
}));

// Dashboard Route
app.get('/', async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    try {
        const u = await pool.query('SELECT * FROM users WHERE id = $1', [req.session.userId]);
        const c = await pool.query('SELECT city_name FROM investments WHERE user_id = $1', [req.session.userId]);
        
        // Safety: If no user found, fallback to empty object
        const userData = u.rows[0] || { phone: 'User', balance: 0, today_income: 0, referral_code: '' };
        // Safety: If no cities found, fallback to empty array
        const citiesData = c.rows.length > 0 ? c.rows.map(r => r.city_name) : [];

        res.render('index', { 
            user: userData, 
            activeCities: citiesData 
        });
    } catch (err) {
        console.error("Dashboard Error:", err);
        res.status(500).send("Error loading dashboard. Check logs.");
    }
});

app.get('/login', (req, res) => res.render('login'));
app.get('/signup', (req, res) => res.render('signup'));
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

// POST Routes for Login/Signup stay the same...
app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE phone = $1 AND password = $2', [phone, password]);
    if (result.rows.length) {
        req.session.userId = result.rows[0].id;
        res.redirect('/');
    } else {
        res.send('<script>alert("Invalid details"); window.location="/login";</script>');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`BITREX Live on ${PORT}`));
