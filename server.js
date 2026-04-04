const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const session = require('express-session');
require('dotenv').config();

const app = express();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'bitrex_final_production_99',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } 
}));

const CITIES = {
    'CITY A': { cost: 1500, daily: 50, tasks: 1 },
    'CITY B': { cost: 3200, daily: 100, tasks: 2 },
    'CITY C': { cost: 7200, daily: 200, tasks: 4 },
    'CITY D': { cost: 12000, daily: 400, tasks: 8 },
    'CITY E': { cost: 15000, daily: 500, tasks: 10 }
};

// --- AUTHENTICATION ROUTES ---
app.get('/', (req, res) => res.redirect('/login'));

app.get('/login', (req, res) => res.render('login'));

// Added Sign-up Route
app.post('/signup', async (req, res) => {
    const { phone, password, referral_by } = req.body;
    // Generate a unique referral code
    const referral_code = 'BTX' + Math.floor(1000 + Math.random() * 9000);
    
    const { data, error } = await supabase.from('users').insert([
        { 
            phone, 
            password, 
            referral_code, 
            balance: 0, 
            todays_income: 0, 
            tasks_today: 0,
            referral_by: referral_by || null 
        }
    ]);
    if (error) return res.send("Registration failed: " + error.message);
    res.redirect('/login');
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    const { data: user } = await supabase.from('users').select('*').eq('phone', phone).eq('password', password).single();
    if (user) { 
        req.session.user_id = user.id; 
        res.redirect('/dashboard'); 
    } else { res.send("Invalid details."); }
});

// --- DASHBOARD ---
app.get('/dashboard', async (req, res) => {
    const user_id = req.session.user_id;
    if (!user_id) return res.redirect('/login');
    const { data: user } = await supabase.from('users').select('*').eq('id', user_id).single();
    const { data: userCities } = await supabase.from('user_cities').select('*').eq('user_id', user_id);
    res.render('index', { user, userCities: userCities || [] });
});

// --- FINANCIAL ROUTES ---

// Added Complete Deposit Route with Evidence
app.post('/deposit', async (req, res) => {
    const { amount, evidence, user_id } = req.body;
    if (!amount || !evidence) return res.json({ success: false, message: "Please provide amount and M-PESA code." });
    
    const { error } = await supabase.from('transactions').insert([
        { user_id, amount, evidence, type: 'deposit', status: 'pending' }
    ]);
    
    if (error) return res.json({ success: false, message: "Error submitting deposit." });
    res.json({ success: true, message: "Deposit submitted for verification!" });
});

app.post('/withdraw', async (req, res) => {
    const { amount, user_id } = req.body;
    const { data: user } = await supabase.from('users').select('balance').eq('id', user_id).single();
    if (user.balance < amount) return res.json({ success: false, message: "Insufficient balance" });
    
    await supabase.from('users').update({ balance: user.balance - amount }).eq('id', user_id);
    await supabase.from('transactions').insert([{ user_id, amount, type: 'withdrawal', status: 'pending' }]);
    res.json({ success: true, message: "Withdrawal request sent!" });
});

// --- INVESTMENT & TASKS ---

app.post('/invest', async (req, res) => {
    const { city_name, user_id } = req.body;
    const cityData = CITIES[city_name];
    const { data: user } = await supabase.from('users').select('balance').eq('id', user_id).single();
    if (user.balance < cityData.cost) return res.json({ success: false, message: "Inadequate balance" });

    await supabase.from('users').update({ balance: user.balance - cityData.cost }).eq('id', user_id);
    await supabase.from('user_cities').insert([{ user_id: parseInt(user_id), city_name, daily_income: cityData.daily, max_tasks: cityData.tasks }]);
    res.json({ success: true, message: "Joined successfully!" });
});

// Fixed Task Logic with Midnight Reset and Limit Rules
app.post('/claim_task', async (req, res) => {
    const { user_id } = req.body;
    const reward = 50;
    const { data: user } = await supabase.from('users').select('*').eq('id', user_id).single();
    
    const lastUpdate = new Date(user.last_task_date || 0).toDateString();
    const today = new Date().toDateString();

    // Check if task was already done today
    if (lastUpdate === today && user.tasks_today >= 1) {
        return res.json({ success: false, message: "Task limit reached. Resetting at midnight!" });
    }

    // Logic to reset todays_income display if it's a new day
    const currentTodayIncome = (lastUpdate === today) ? (user.todays_income || 0) : 0;
    const newTaskCount = (lastUpdate === today) ? (user.tasks_today + 1) : 1;

    await supabase.from('users').update({
        balance: (user.balance || 0) + reward,
        todays_income: currentTodayIncome + reward,
        total_income: (user.total_income || 0) + reward,
        tasks_today: newTaskCount,
        last_task_date: new Date()
    }).eq('id', user_id);

    res.json({ success: true, message: "Task complete! Ksh 50 added to today's income." });
});

app.listen(3000, () => console.log("BITREX Final Server Live on 3000"));
