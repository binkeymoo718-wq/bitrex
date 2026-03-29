require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();

// 1. DATABASE CONFIGURATION (Supabase)
const supabase = createClient(
    process.env.https://mpasnmqayaunhxdqlpsp.supabase.co,
    process.env.sb_publishable_T7Yk4Z3zxOjLh-wFMJfAtw_76iXk_qY
);

// 2. APP MIDDLEWARE
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'bitrex_secure_vault_2026',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// 3. BUSINESS CONSTANTS
const CITIES = {
    'CITY A': { price: 1500, dailyTasks: 1, dailyIncome: 50 },
    'CITY B': { price: 3200, dailyTasks: 2, dailyIncome: 100 },
    'CITY C': { price: 7200, dailyTasks: 4, dailyIncome: 200 },
    'CITY D': { price: 12000, dailyTasks: 8, dailyIncome: 400 },
    'CITY E': { price: 15000, dailyTasks: 10, dailyIncome: 500 }
};

// 4. ROUTES
app.get('/', (req, res) => {
    if (req.session.userId) return res.redirect('/dashboard');
    res.render('index'); // Sign up / Login page
});

// Authentication: Sign Up
app.post('/auth/signup', async (req, res) => {
    const { phone, email, password, refCode } = req.body;
    
    // Referral logic: unique code for every user
    const personalRefCode = "BTX" + Math.random().toString(36).substring(2, 7).toUpperCase();

    const { data, error } = await supabase
        .from('users')
        .insert([{ 
            phone, 
            email, 
            password, // Note: In production, hash this with bcrypt
            referral_code: personalRefCode,
            referred_by: refCode || null,
            balance: 0,
            total_earnings: 0
        }])
        .select();

    if (error) return res.status(400).send("Registration failed: " + error.message);
    
    req.session.userId = data[0].id;
    res.redirect('/dashboard');
});

// Dashboard Data Fetching
app.get('/dashboard', async (req, res) => {
    if (!req.session.userId) return res.redirect('/');

    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', req.session.userId)
        .single();

    const { data: history } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', req.session.userId)
        .order('created_at', { ascending: false });

    res.render('dashboard', { user, history, cities: CITIES });
});

// Investment Action
app.post('/invest', async (req, res) => {
    const { cityName } = req.body;
    const city = CITIES[cityName];

    const { data: user } = await supabase.from('users').select('*').eq('id', req.session.userId).single();

    if (user.balance < city.price) return res.send("Insufficient funds. Minimum deposit is Ksh 300.");

    await supabase.from('users').update({ 
        balance: user.balance - city.price, 
        active_city: cityName 
    }).eq('id', user.id);

    await supabase.from('transactions').insert({
        user_id: user.id,
        type: 'Investment',
        amount: city.price,
        description: `Joined ${cityName}`
    });

    res.redirect('/dashboard');
});

// Daily Task Execution
app.post('/task/complete', async (req, res) => {
    const { data: user } = await supabase.from('users').select('*').eq('id', req.session.userId).single();
    
    if (!user.active_city) return res.send("No active investment found.");
    
    const cityRules = CITIES[user.active_city];
    
    // Task check logic (Resetting daily or checking count)
    if (user.tasks_today >= cityRules.dailyTasks) return res.send("Daily task limit reached.");

    const reward = 50;
    await supabase.from('users').update({
        balance: user.balance + reward,
        total_earnings: user.total_earnings + reward,
        tasks_today: user.tasks_today + 1
    }).eq('id', user.id);

    res.redirect('/dashboard');
});

// Wallet: Withdrawal
app.post('/wallet/withdraw', async (req, res) => {
    const { amount, password } = req.body;
    const { data: user } = await supabase.from('users').select('*').eq('id', req.session.userId).single();

    if (amount < 500) return res.send("Minimum withdrawal is Ksh 500");
    if (user.balance < amount) return res.send("Insufficient balance.");

    await supabase.from('users').update({ balance: user.balance - amount }).eq('id', user.id);
    await supabase.from('transactions').insert({
        user_id: user.id,
        type: 'Withdrawal',
        amount: amount,
        status: 'Pending'
    });

    res.redirect('/dashboard');
});

// 5. START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`BITREX Engine online at http://localhost:${PORT}`);
});
