require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();

// 1. DATABASE CONFIGURATION
// These pull from your Render Environment tab
const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_KEY
);

// 2. APP MIDDLEWARE
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'bitrex-secure-key-2026',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } 
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 3. ROUTES

// --- SIGNUP ROUTE ---
app.post('/auth/signup', async (req, res) => {
    const { phone, email, password, refCode } = req.body;
    const newUserReferralCode = 'BTX' + Math.random().toString(36).toUpperCase().substring(2, 7);

    const { data, error } = await supabase
        .from('users')
        .insert([{ 
            phone: phone.trim(), 
            email: email.trim(), 
            password: password.trim(), 
            referred_by: refCode || null,
            referral_code: newUserReferralCode,
            balance: 0,
            total_earnings: 0,
            tasks_today: 0
        }]);

    if (error) {
        if (error.code === '23505') {
            return res.status(400).json({ success: false, message: "Already registered!" });
        }
        return res.status(500).json({ success: false, message: error.message });
    }
    res.status(201).json({ success: true, message: "Registration successful!", referral_code: newUserReferralCode });
});

// --- LOGIN ROUTE ---
app.post('/auth/login', async (req, res) => {
    const { phone, password } = req.body;
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('phone', phone.trim())
        .eq('password', password.trim())
        .maybeSingle();

    if (error || !user) {
        return res.status(401).json({ success: false, message: "Invalid credentials." });
    }

    req.session.user = user;
    res.status(200).json({ success: true, message: "Login successful!", user: { phone: user.phone, balance: user.balance } });
});

// --- INVESTMENT LOGIC (NEW) ---
app.post('/invest', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ message: "Please login first" });

    const { city, cost } = req.body; // e.g., { "city": "CITY A", "cost": 1000 }
    const userId = req.session.user.id;

    // Fetch latest balance from DB
    const { data: userDB } = await supabase.from('users').select('balance').eq('id', userId).single();

    if (userDB.balance < cost) {
        return res.status(400).json({ success: false, message: "Insufficient balance!" });
    }

    const { error } = await supabase
        .from('users')
        .update({ 
            balance: userDB.balance - cost, 
            active_city: city 
        })
        .eq('id', userId);

    if (error) return res.status(500).json({ success: false, message: "Investment failed." });

    // Update session
    req.session.user.balance -= cost;
    req.session.user.active_city = city;

    res.json({ success: true, message: `Successfully joined ${city}!` });
});

// --- DAILY TASK LOGIC (NEW) ---
app.post('/claim-task', async (req, res) => {
    if (!req.session.user || !req.session.user.active_city) {
        return res.status(400).json({ message: "No active investment." });
    }

    // Profits: City A = 150, B = 400, C = 1000
    const profits = { "CITY A": 150, "CITY B": 400, "CITY C": 1000 };
    const dailyProfit = profits[req.session.user.active_city] || 0;

    const { data: userDB } = await supabase.from('users').select('balance, total_earnings').eq('id', req.session.user.id).single();

    const { error } = await supabase
        .from('users')
        .update({ 
            balance: userDB.balance + dailyProfit,
            total_earnings: userDB.total_earnings + dailyProfit,
            tasks_today: 1 // Marks task as done for the day
        })
        .eq('id', req.session.user.id);

    if (error) return res.status(500).json({ message: "Claim failed." });

    req.session.user.balance += dailyProfit;
    res.json({ success: true, newBalance: req.session.user.balance });
});

// --- WITHDRAWAL ROUTE ---
app.post('/withdraw', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ message: "Please login first" });

    const { amount } = req.body;
    const userId = req.session.user.id;

    // 1. Get current balance
    const { data: user } = await supabase.from('users').select('balance').eq('id', userId).single();

    if (user.balance < amount) {
        return res.status(400).json({ success: false, message: "Insufficient balance for withdrawal!" });
    }

    // 2. Create a pending withdrawal in your 'transactions' table
    const { error: transError } = await supabase.from('transactions').insert([{
        user_id: userId,
        amount: amount,
        type: 'withdrawal',
        status: 'pending'
    }]);

    // 3. Deduct from balance
    const { error: updateError } = await supabase
        .from('users')
        .update({ balance: user.balance - amount })
        .eq('id', userId);

    if (transError || updateError) return res.status(500).json({ success: false, message: "Withdrawal failed." });

    req.session.user.balance -= amount;
    res.json({ success: true, message: "Withdrawal request submitted for approval!" });
});
// --- LOGOUT ---
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// --- DASHBOARD RENDER ---
app.get('/', (req, res) => {
    res.render('index', { user: req.session.user || null });
});

// 4. START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`BITREX active on port ${PORT}`);
});
