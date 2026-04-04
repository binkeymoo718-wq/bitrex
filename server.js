const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const app = express();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// This prevents "Internal Server Error" by keeping you logged in
app.use(session({
    secret: 'bitrex_8822_secret',
    resave: false,
    saveUninitialized: true
}));

// --- ROUTES ---

// Fix: Root redirect
app.get('/', (req, res) => res.redirect('/login'));

app.get('/login', (req, res) => res.render('login'));
app.get('/signup', (req, res) => res.render('signup'));

app.get('/dashboard', async (req, res) => {
    const user_id = req.session.user_id;
    if (!user_id) return res.redirect('/login');

    const { data: user } = await supabase.from('users').select('*').eq('id', user_id).single();
    const { data: userCities } = await supabase.from('user_cities').select('*').eq('user_id', user_id);

    res.render('index', { user, userCities: userCities || [] });
});

// --- TASK LOGIC (Cumulative & Working) ---
app.post('/claim_task', async (req, res) => {
    const user_id = req.session.user_id;
    if (!user_id) return res.json({ success: false, message: "Session expired." });

    const { data: user } = await supabase.from('users').select('*').eq('id', user_id).single();
    const { data: cities } = await supabase.from('user_cities').select('*').eq('user_id', user_id);

    if (!cities || cities.length === 0) return res.json({ success: false, message: "Join a city first!" });

    const totalMaxTasks = cities.reduce((sum, c) => sum + (c.max_tasks || 0), 0);
    if (user.tasks_today >= totalMaxTasks) return res.json({ success: false, message: "Task limit reached!" });

    // Math fix: Ensure these are treated as numbers
    const reward = 50; 
    const newBalance = Number(user.balance || 0) + reward;

    await supabase.from('users').update({
        balance: newBalance,
        todays_income: Number(user.todays_income || 0) + reward,
        total_income: Number(user.total_income || 0) + reward,
        tasks_today: (user.tasks_today || 0) + 1
    }).eq('id', user_id);

    res.json({ success: true, message: `Ksh ${reward} added!` });
});

// --- DEPOSIT & WITHDRAWAL ---
app.post('/deposit', async (req, res) => {
    const { amount, evidence } = req.body;
    const user_id = req.session.user_id;
    
    await supabase.from('transactions').insert([{ 
        user_id, amount: Number(amount), evidence, type: 'deposit', status: 'pending' 
    }]);
    res.json({ success: true, message: "Submitted to admin!" });
});

app.post('/withdraw', async (req, res) => {
    const { amount } = req.body;
    const user_id = req.session.user_id;
    const { data: user } = await supabase.from('users').select('balance').eq('id', user_id).single();

    if (Number(user.balance) < Number(amount)) return res.json({ success: false, message: "Insufficient funds" });

    await supabase.from('users').update({ balance: Number(user.balance) - Number(amount) }).eq('id', user_id);
    await supabase.from('transactions').insert([{ 
        user_id, amount: Number(amount), type: 'withdrawal', status: 'pending' 
    }]);
    res.json({ success: true, message: "Withdrawal processing." });
});

// --- AUTH LOGIC ---
app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    const { data: user } = await supabase.from('users').select('*').eq('phone', phone).eq('password', password).single();
    if (user) {
        req.session.user_id = user.id; // Save BIGINT ID to session
        res.redirect('/dashboard');
    } else {
        res.send("Invalid details.");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`BITREX running on ${PORT}`));
