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

app.use(session({
    secret: 'bitrex_final_secure_99',
    resave: false,
    saveUninitialized: true
}));

const CITIES = {
    'CITY A': { cost: 1500, daily: 50, tasks: 1 },
    'CITY B': { cost: 3200, daily: 100, tasks: 2 },
    'CITY C': { cost: 7200, daily: 200, tasks: 4 },
    'CITY D': { cost: 12000, daily: 400, tasks: 8 },
    'CITY E': { cost: 15000, daily: 500, tasks: 10 }
};

// --- ROUTES ---
app.get('/', (req, res) => res.redirect('/login'));

app.get('/login', (req, res) => res.render('login'));

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.get('/dashboard', async (req, res) => {
    const user_id = req.session.user_id;
    if (!user_id) return res.redirect('/login');

    const { data: user } = await supabase.from('users').select('*').eq('id', user_id).single();
    const { data: userCities } = await supabase.from('user_cities').select('*').eq('user_id', user_id);

    res.render('index', { user, userCities: userCities || [] });
});

// --- INVESTMENT LOGIC (Subtracts balance & joins) ---
app.post('/invest', async (req, res) => {
    const { city_name, user_id } = req.body;
    const cityData = CITIES[city_name];
    
    const { data: user } = await supabase.from('users').select('balance').eq('id', user_id).single();
    
    if (!user || user.balance < cityData.cost) {
        return res.json({ success: false, message: "Inadequate balance to join " + city_name });
    }

    // 1. Subtract cost & update balance
    const newBalance = user.balance - cityData.cost;
    await supabase.from('users').update({ balance: newBalance }).eq('id', user_id);
    
    // 2. Register city
    await supabase.from('user_cities').insert([{ 
        user_id: parseInt(user_id), 
        city_name: city_name, 
        daily_income: cityData.daily, 
        max_tasks: cityData.tasks 
    }]);

    res.json({ success: true, message: "Joined successfully!" });
});

// --- TASK CLAIMING ---
app.post('/claim_task', async (req, res) => {
    const { user_id } = req.body;
    const { data: user } = await supabase.from('users').select('*').eq('id', user_id).single();
    const { data: cities } = await supabase.from('user_cities').select('*').eq('user_id', user_id);

    if (!cities || cities.length === 0) return res.json({ success: false, message: "No active city!" });

    const totalMaxTasks = cities.reduce((sum, c) => sum + (c.max_tasks || 0), 0);
    if (user.tasks_today >= totalMaxTasks) return res.json({ success: false, message: "Number of task limit reached!" });

    const reward = 50; 
    await supabase.from('users').update({
        balance: (user.balance || 0) + reward,
        todays_income: (user.todays_income || 0) + reward,
        total_income: (user.total_income || 0) + reward,
        tasks_today: (user.tasks_today || 0) + 1
    }).eq('id', user_id);

    res.json({ success: true, message: "Task completed! Ksh 50 earned." });
});

// --- DEPOSIT/WITHDRAW ---
app.post('/deposit', async (req, res) => {
    const { amount, evidence, user_id } = req.body;
    if (amount < 300) return res.json({ success: false, message: "Min deposit Ksh 300" });
    await supabase.from('transactions').insert([{ user_id, amount, evidence, type: 'deposit', status: 'pending' }]);
    res.json({ success: true, message: "Deposit submitted for approval!" });
});

app.post('/withdraw', async (req, res) => {
    const { amount, user_id } = req.body;
    const { data: user } = await supabase.from('users').select('balance').eq('id', user_id).single();

    if (amount < 500) return res.json({ success: false, message: "Min withdrawal Ksh 500" });
    if (user.balance < amount) return res.json({ success: false, message: "Insufficient balance" });

    await supabase.from('users').update({ balance: user.balance - amount }).eq('id', user_id);
    await supabase.from('transactions').insert([{ user_id, amount, type: 'withdrawal', status: 'pending' }]);
    res.json({ success: true, message: "Withdrawal request sent!" });
});

// --- AUTH ---
app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    const { data: user } = await supabase.from('users').select('*').eq('phone', phone).eq('password', password).single();
    if (user) { req.session.user_id = user.id; res.redirect('/dashboard'); }
    else { res.send("Invalid credentials."); }
});

app.listen(3000, () => console.log("Server active on port 3000"));
