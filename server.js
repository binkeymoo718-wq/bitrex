const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const app = express();

//  DATABASE CONFIGURATION
const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_KEY
);

const ADMIN_PASS = '1234'; // Change this to your preferred admin password

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- ROUTES ---

// 1. Home / Login Redirect
app.get('/', (req, res) => {
    res.redirect('/login');
});

// 2. Signup Page
app.get('/signup', (req, res) => {
    res.render('signup');
});

// 3. Login Page
app.get('/login', (req, res) => {
    res.render('login');
});

// Add this inside your server.js
app.post('/deposit', async (req, res) => {
    const { amount, evidence } = req.body;
    // This inserts the deposit into your transactions table for the admin to see
    const { error } = await supabase.from('transactions').insert([
        { amount, evidence, status: 'pending', type: 'deposit' }
    ]);
    if (error) return res.json({ success: false, message: error.message });
    res.json({ success: true, message: "Deposit submitted! Waiting for admin approval." });
});

app.post('/invest', async (req, res) => {
    const { city, cost } = req.body;
    // Logic: Check if user has enough money, then deduct and update active_city
    // (I can provide the full logic for this if you need it!)
    res.json({ success: true, message: `Successfully invested in ${city}!` });
});

// 4. Admin Dashboard (Fetches pending transactions)
app.get('/admin/dashboard', async (req, res) => {
    const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('status', 'pending');
    
    res.render('admin', { pendingTransactions: data || [] });
});

// --- AUTHENTICATION LOGIC ---

app.post('/signup', async (req, res) => {
    const { name, phone, password } = req.body;
    const { data, error } = await supabase
        .from('users')
        .insert([{ name, phone, password, balance: 0 }]);

    if (error) return res.send("Error creating account: " + error.message);
    res.redirect('/login');
});

app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('phone', phone)
        .eq('password', password)
        .single();

    if (data) {
        res.render('index', { user: data }); // Show the user dashboard
    } else {
        res.send("Invalid phone or password.");
    }
});

// --- ADMIN ACTIONS ---

app.post('/admin/approve_deposit', async (req, res) => {
    const { transactionId, adminPass } = req.body;

    if (adminPass !== ADMIN_PASS) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // 1. Get transaction details
    const { data: trans } = await supabase.from('transactions').select('*').eq('id', transactionId).single();
    
    // 2. Update user balance using the function we created in SQL
    await supabase.rpc('increment_balance', { user_id_input: trans.user_id, amount_input: trans.amount });

    // 3. Mark transaction as approved
    await supabase.from('transactions').update({ status: 'approved' }).eq('id', transactionId);

    res.json({ success: true, message: "Deposit Approved!" });
});

// --- START SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`BITREX Server running on port ${PORT}`);
});
