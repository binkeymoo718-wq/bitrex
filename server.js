require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();

// 1. DATABASE CONFIGURATION
const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_KEY
);

// 2. APP MIDDLEWARE
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'bitrex-2026-secure-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } 
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 3. AUTH ROUTES

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
            total_earnings: 0
        }])
        .select();

    if (error) return res.status(400).json({ success: false, message: error.message });
    res.status(201).json({ success: true, message: "Signup success!", referral_code: newUserReferralCode });
});

app.post('/auth/login', async (req, res) => {
    const { phone, password } = req.body;
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('phone', phone.trim())
        .eq('password', password.trim())
        .maybeSingle();

    if (error || !user) return res.status(401).json({ success: false, message: "Invalid credentials." });

    req.session.user = user;
    res.status(200).json({ success: true, user: { phone: user.phone, balance: user.balance } });
});

// 4. INVESTMENT & TASK ROUTES

app.post('/invest', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ message: "Login first" });

    const { city, cost } = req.body;
    const userId = req.session.user.id;

    const { data: userDB } = await supabase.from('users').select('balance').eq('id', userId).single();

    if (userDB.balance < cost) return res.status(400).json({ success: false, message: "Insufficient balance" });

    const { error } = await supabase
        .from('users')
        .update({ balance: userDB.balance - cost, active_city: city })
        .eq('id', userId);

    if (error) return res.status(500).json({ success: false, message: "Invest failed" });

    req.session.user.balance -= cost;
    req.session.user.active_city = city;
    res.json({ success: true, message: `Joined ${city}` });
});

   // --- CLAIM TASK ROUTE ---
app.post('/claim_task', async (req, res) => {
    // 1. Session Check
    if (!req.session.user) return res.status(401).json({ success: false, message: "Please login first" });

    const userId = req.session.user.id;
    const { taskId } = req.body;

    // 2. Fetch user data to check city and existing balance
    const { data: userDB, error: userError } = await supabase
        .from('users')
        .select('balance, total_earnings, tasks_today, active_city')
        .eq('id', userId)
        .single();

    // 3. Error Handling for No Investment
    if (userError || !userDB.active_city) {
        return res.status(400).json({ success: false, message: "No active city investment found." });
    }

    // 4. Define profit based on city tiers
    let dailyProfit = 0;
    if (userDB.active_city === 'CITY A') dailyProfit = 50;
    else if (userDB.active_city === 'CITY B') dailyProfit = 150;
    else if (userDB.active_city === 'CITY C') dailyProfit = 200;
    // Add other city tiers (D, E) as needed

    // 5. Update User Balance, Total Earnings, and Task Count in Supabase
    const { error: updateError } = await supabase
        .from('users')
        .update({
            balance: userDB.balance + dailyProfit,
            total_earnings: userDB.total_earnings + dailyProfit,
            tasks_today: userDB.tasks_today + 1
        })
        .eq('id', userId);

    if (updateError) {
        console.error("Task Update Error:", updateError);
        return res.status(500).json({ success: false, message: "Failed to update earnings." });
    }

    res.json({ 
        success: true, 
        message: "Task claimed successfully!", 
        newBalance: userDB.balance + dailyProfit 
    });
    

// 5. WITHDRAWAL ROUTE (FIXED FOR transactions TABLE)
app.post('/withdraw', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, message: "Please login first" });

    const { amount } = req.body;
    const userId = req.session.user.id;

    // Fetch latest balance
    const { data: userDB, error: fetchError } = await supabase.from('users').select('balance').eq('id', userId).single();

    if (fetchError || userDB.balance < amount) {
        return res.status(400).json({ success: false, message: "Insufficient balance!" });
    }

    // 1. Insert into transactions (Matches your 'userId' and 'amount' columns)
    const { error: transError } = await supabase
        .from('transactions')
        .insert([{
            userId: userId, 
            amount: parseInt(amount),
            type: 'withdrawal',
            status: 'pending'
        }])
        .select(); // Essential for confirming insert worked

    if (transError) {
        console.error("Trans Error:", transError);
        return res.status(500).json({ success: false, message: "Database rejected transaction record." });
    }

    // 2. Update user balance
    await supabase.from('users').update({ balance: userDB.balance - amount }).eq('id', userId);

    req.session.user.balance -= amount;
    res.json({ success: true, message: "Withdrawal pending!" });
});

// Add this below your /withdraw route in server.js
app.post('/deposit', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, message: "Please login first" });

    const { amount } = req.body;
    const userId = req.session.user.id;

    const { error: transError } = await supabase
        .from('transactions')
        .insert([{
            userId: userId, 
            amount: parseInt(amount),
            type: 'deposit',
            status: 'pending'
        }]);

    if (transError) {
        return res.status(500).json({ success: false, message: "Database rejected deposit record." });
    }

    res.json({ success: true, message: "Deposit submitted for verification!" });
});

// 6. LOGOUT & DASHBOARD
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.get('/', (req, res) => {
    res.render('index', { user: req.session.user || null });
});

// 7. START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`BITREX active on port ${PORT}`);
});
