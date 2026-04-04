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
    secret: 'bitrex_prod_final_v3',
    resave: false,
    saveUninitialized: false
}));

// --- SIGNUP ROUTE ---
app.post('/signup', async (req, res) => {
    const { phone, password, referral_by } = req.body;
    const referral_code = 'BTX' + Math.floor(1000 + Math.random() * 9000);
    
    const { data, error } = await supabase.from('users').insert([
        { phone, password, referral_code, balance: 0, referral_by: referral_by || null }
    ]);
    if (error) return res.send("Registration failed: " + error.message);
    res.redirect('/login');
});

// --- DEPOSIT ROUTE (Fixed for Evidence) ---
app.post('/deposit', async (req, res) => {
    const { amount, evidence, user_id } = req.body;
    if (amount < 300) return res.json({ success: false, message: "Min deposit Ksh 300" });
    
    await supabase.from('transactions').insert([
        { user_id, amount, evidence, type: 'deposit', status: 'pending' }
    ]);
    res.json({ success: true, message: "Submitted! Awaiting verification." });
});

// --- TASK LOGIC (Midnight Check) ---
app.post('/claim_task', async (req, res) => {
    const { user_id } = req.body;
    const reward = 50;
    
    const { data: user } = await supabase.from('users').select('*').eq('id', user_id).single();
    
    // Check if tasks were last updated today
    const lastUpdate = new Date(user.last_task_date).toDateString();
    const today = new Date().toDateString();

    if (lastUpdate === today && user.tasks_today >= 1) {
        return res.json({ success: false, message: "Task limit reached! Come back after midnight." });
    }

    const tasksCount = (lastUpdate === today) ? (user.tasks_today + 1) : 1;

    await supabase.from('users').update({
        balance: user.balance + reward,
        todays_income: (lastUpdate === today) ? (user.todays_income + reward) : reward,
        tasks_today: tasksCount,
        last_task_date: new Date()
    }).eq('id', user_id);

    res.json({ success: true, message: "Task complete! Ksh 50 added." });
});

app.listen(3000, () => console.log("BITREX v3 Active"));
