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
app.use(session({ secret: 'bitrex_secure_77', resave: false, saveUninitialized: true }));

// City Configuration
const CITIES = {
    'CITY A': { cost: 1500, daily: 50, tasks: 1 },
    'CITY B': { cost: 3200, daily: 100, tasks: 2 },
    'CITY C': { cost: 7200, daily: 200, tasks: 4 },
    'CITY D': { cost: 12000, daily: 400, tasks: 8 },
    'CITY E': { cost: 15000, daily: 500, tasks: 10 }
};

// --- AUTH ---
app.post('/signup', async (req, res) => {
    const { phone, email, password, ref_code } = req.body;
    const my_ref = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { error } = await supabase.from('users').insert([{ 
        phone, email, password, referral_code: my_ref, referred_by: ref_code, balance: 0 
    }]);
    if (error) return res.send("Error: " + error.message);
    res.redirect('/login');
});

app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    const { data: user } = await supabase.from('users').select('*').eq('phone', phone).eq('password', password).single();
    if (user) { req.session.user_id = user.id; res.redirect('/dashboard'); }
    else { res.send("<script>alert('Invalid Login'); window.location='/login';</script>"); }
});

// --- DASHBOARD ---
app.get('/dashboard', async (req, res) => {
    const user_id = req.session.user_id;
    if (!user_id) return res.redirect('/login');

    const { data: user } = await supabase.from('users').select('*').eq('id', user_id).single();
    const { data: userCities } = await supabase.from('user_cities').select('*').eq('user_id', user_id);

    res.render('index', { user, userCities: userCities || [] });
});

// --- INVESTMENT (Cumulative Support) ---
app.post('/invest', async (req, res) => {
    const { city_name, user_id } = req.body;
    const cityData = CITIES[city_name];
    
    const { data: user } = await supabase.from('users').select('balance').eq('id', user_id).single();
    if (user.balance < cityData.cost) return res.json({ success: false, message: "Inadequate Balance" });

    // 1. Deduct cost
    await supabase.from('users').update({ balance: user.balance - cityData.cost }).eq('id', user_id);
    
    // 2. Add to user_cities table
    await supabase.from('user_cities').insert([{ 
        user_id, city_name, daily_income: cityData.daily, max_tasks: cityData.tasks 
    }]);

    res.json({ success: true, message: `Welcome to ${city_name}!` });
});

// --- TASK CLAIMING ---
app.post('/claim_task', async (req, res) => {
    const { user_id } = req.body;
    const { data: user } = await supabase.from('users').select('*').eq('id', user_id).single();
    const { data: cities } = await supabase.from('user_cities').select('*').eq('user_id', user_id);

    if (!cities || cities.length === 0) return res.json({ success: false, message: "Join a city first!" });

    // Calculate total allowed tasks from ALL cities
    const totalMaxTasks = cities.reduce((sum, c) => sum + (c.max_tasks || 0), 0);
    const totalDailyReward = cities.reduce((sum, c) => sum + (c.daily_income || 0), 0);
    
    // Individual task reward is total daily divided by max tasks (always ksh 50 per task based on your prompt)
    const taskReward = 50; 

    if (user.tasks_today >= totalMaxTasks) {
        return res.json({ success: false, message: "Number of task limit reached!" });
    }

    const { error } = await supabase.from('users').update({
        balance: (user.balance || 0) + taskReward,
        todays_income: (user.todays_income || 0) + taskReward,
        total_income: (user.total_income || 0) + taskReward,
        tasks_today: (user.tasks_today || 0) + 1
    }).eq('id', user_id);

    if (error) return res.json({ success: false, message: "Task Failed" });
    res.json({ success: true, message: `Task complete! Ksh ${taskReward} earned.` });
});

// --- TRANSACTIONS ---
app.post('/deposit', async (req, res) => {
    const { amount, evidence, user_id } = req.body;
    if (amount < 300) return res.json({ success: false, message: "Min deposit Ksh 300" });
    await supabase.from('transactions').insert([{ user_id, amount, evidence, type: 'deposit', status: 'pending' }]);
    res.json({ success: true, message: "Sent to admin for verification." });
});

app.post('/withdraw', async (req, res) => {
    const { amount, user_id, password } = req.body;
    const { data: user } = await supabase.from('users').select('*').eq('id', user_id).single();

    if (amount < 500) return res.json({ success: false, message: "Min withdraw Ksh 500" });
    if (user.balance < amount) return res.json({ success: false, message: "Insufficient balance" });

    await supabase.from('users').update({ balance: user.balance - amount }).eq('id', user_id);
    await supabase.from('transactions').insert([{ user_id, amount, type: 'withdrawal', status: 'pending' }]);
    res.json({ success: true, message: "Withdrawal processing." });
});

app.listen(3000, () => console.log("BITREX Live on Port 3000"));
