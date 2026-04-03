const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const app = express();

// --- CONFIGURATION ---
const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_KEY
);

const ADMIN_PASS = 'Binkey@1722'; 

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- PAGE ROUTES ---

app.get('/', (req, res) => res.redirect('/login'));
app.get('/signup', (req, res) => res.render('signup'));
app.get('/login', (req, res) => res.render('login'));

// Admin Dashboard
app.get('/admin/dashboard', async (req, res) => {
    const { data } = await supabase.from('transactions').select('*').eq('status', 'pending');
    res.render('admin', { pendingTransactions: data || [] });
});

// --- AUTH LOGIC ---

app.post('/signup', async (req, res) => {
    const { name, phone, password } = req.body;
    const { error } = await supabase.from('users').insert([{ name, phone, password, balance: 0, active_city: 'None' }]);
    if (error) return res.send("Error: " + error.message);
    res.redirect('/login');
});

app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    const { data: user } = await supabase.from('users').select('*').eq('phone', phone).eq('password', password).single();

    if (user) {
        res.render('index', { user }); 
    } else {
        res.send("Invalid login details.");
    }
});

// --- BITREX CORE FEATURES ---

// 1. Submit Deposit (Sends to Admin for approval)
app.post('/deposit', async (req, res) => {
    const { amount, evidence, user_id } = req.body; 
    const { error } = await supabase.from('transactions').insert([
        { user_id, amount, evidence, status: 'pending', type: 'deposit' }
    ]);
    if (error) return res.json({ success: false, message: "Failed to submit" });
    res.json({ success: true, message: "Submitted! Admin will verify shortly." });
});

// 2. Invest in City (Checks balance)
app.post('/invest', async (req, res) => {
    const { city, cost, user_id } = req.body;

    // Fetch user's current balance
    const { data: user } = await supabase.from('users').select('balance').eq('id', user_id).single();

    if (user.balance < cost) {
        return res.json({ success: false, message: "Inadequate Balance. Please Deposit." });
    }

    // Deduct money and set city
    const newBalance = user.balance - cost;
    await supabase.from('users').update({ balance: newBalance, active_city: city }).eq('id', user_id);

    res.json({ success: true, message: `Successfully invested in ${city}!` });
});

// 3. Claim Daily Task
app.post('/claim_task', async (req, res) => {
    const { user_id } = req.body;
    const { data: user } = await supabase.from('users').select('*').eq('id', user_id).single();

    if (user.active_city === 'None') {
        return res.json({ success: false, message: "You must invest in a City first!" });
    }

    // Define daily rewards after completion of task
    const rewards = { 'CITY A': 50, 'CITY B': 100, 'CITY C': 200, 'CITY D': 400 };
    const reward = rewards[user.active_city] || 0;

    await supabase.from('users').update({ balance: user.balance + reward }).eq('id', user_id);
    res.json({ success: true, message: `Task Complete! You earned Ksh ${reward}` });
});

// --- START ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`BITREX Live on port ${PORT}`));
