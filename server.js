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
// ... (Your existing express and supabase setup)

// 1. FIXED INVESTMENT (Subtracts money)
app.post('/invest', async (req, res) => {
    const { city, cost, user_id } = req.body;
    const { data: user } = await supabase.from('users').select('balance').eq('id', user_id).single();

    if (user.balance < cost) return res.json({ success: false, message: "Inadequate Balance!" });

    // Deduct and Update
    const { error } = await supabase.from('users')
        .update({ balance: user.balance - cost, active_city: city })
        .eq('id', user_id);

    if (error) return res.json({ success: false, message: "Update Failed" });
    res.json({ success: true, message: `Invested in ${city}!` });
});

// Task Limits per City
const TASK_LIMITS = {
    'CITY A': 1,  // Rewards Ksh 50
    'CITY B': 2,  // Rewards Ksh 100
    'CITY C': 5,  // Rewards Ksh 250
    'CITY D': 8,  // Rewards Ksh 400
    'CITY E': 10  // Rewards Ksh 500
};

app.post('/claim_task', async (req, res) => {
    const { user_id } = req.body;
    
    // 1. Fetch user data
    const { data: user } = await supabase.from('users').select('*').eq('id', user_id).single();
    
    // 2. Validation
    if (!user.active_city || user.active_city === 'None') {
        return res.json({ success: false, message: "No investment found. Join a city first!" });
    }

    const limit = TASK_LIMITS[user.active_city] || 0;
    if (user.tasks_completed_today >= limit) {
        return res.json({ success: false, message: "Task limit reached for today!" });
    }

    // 3. Update Balances
    const newBalance = user.balance + 50;
    const newTodayIncome = user.todays_income + 50;
    const newCompleted = user.tasks_completed_today + 1;

    await supabase.from('users').update({
        balance: newBalance,
        todays_income: newTodayIncome,
        tasks_completed_today: newCompleted
    }).eq('id', user_id);

    res.json({ success: true, message: "Task claimed successfully!" });
});

// --- INVESTMENT ROUTE (Multi-City Support) ---
app.post('/invest', async (req, res) => {
    const { city, cost, user_id } = req.body;
    const incomeMap = { 'CITY A': 50, 'CITY B': 100, 'CITY C': 250, 'CITY D': 400, 'CITY E': 500 };

    const { data: user } = await supabase.from('users').select('balance').eq('id', user_id).single();
    if (user.balance < cost) return res.json({ success: false, message: "Inadequate balance" });

    // Deduct balance and record the NEW city
    await supabase.from('users').update({ balance: user.balance - cost }).eq('id', user_id);
    await supabase.from('user_cities').insert([{ user_id, city_name: city, daily_income: incomeMap[city] }]);

    res.json({ success: true, message: `Successfully joined ${city}!` });
});

// --- TASK CLAIMING ROUTE (Fixes Balance Not Increasing) ---
app.post('/claim_task', async (req, res) => {
    const { user_id } = req.body;

    const { data: user } = await supabase.from('users').select('*').eq('id', user_id).single();
    const { data: cities } = await supabase.from('user_cities').select('daily_income').eq('user_id', user_id);

    if (!cities || cities.length === 0) return res.json({ success: false, message: "Join a city first!" });

    // Calculate sum of daily income from ALL joined cities
    const totalDailyReward = cities.reduce((sum, c) => sum + c.daily_income, 0);
    
    if (user.tasks_today >= 1) return res.json({ success: false, message: "Tasks already completed today!" });

    // Increase balance by the summed amount
    const newBalance = (user.balance || 0) + totalDailyReward;
    await supabase.from('users').update({
        balance: newBalance,
        todays_income: totalDailyReward,
        total_income: (user.total_income || 0) + totalDailyReward,
        tasks_today: 1 
    }).eq('id', user_id);

    res.json({ success: true, message: `Ksh ${totalDailyReward} added to balance!` });
});

// --- WITHDRAWAL ROUTE (Ksh 500 Min) ---
app.post('/withdraw', async (req, res) => {
    const { amount, user_id } = req.body;
    if (amount < 500) return res.json({ success: false, message: "Minimum withdrawal is Ksh 500" });

    const { data: user } = await supabase.from('users').select('balance').eq('id', user_id).single();
    if (user.balance < amount) return res.json({ success: false, message: "Inadequate balance" });

    await supabase.from('users').update({ balance: user.balance - amount }).eq('id', user_id);
    await supabase.from('transactions').insert([{ user_id, amount, type: 'withdrawal', status: 'pending' }]);
    res.json({ success: true, message: "Withdrawal submitted!" });
});

// 2. FIXED ADMIN APPROVAL (Reflects on balance)
app.post('/admin/approve', async (req, res) => {
    const { trans_id, user_id, amount } = req.body;

    // A: Mark transaction as approved
    await supabase.from('transactions').update({ status: 'approved' }).eq('id', trans_id);

    // B: Fetch current user balance
    const { data: user } = await supabase.from('users').select('balance').eq('id', user_id).single();

    // C: Add the money to their account
    await supabase.from('users').update({ balance: user.balance + parseFloat(amount) }).eq('id', user_id);

    res.json({ success: true, message: "Approved and balance updated!" });
});

// 3. FIXED TASK (Checks if invested first)
app.post('/claim_task', async (req, res) => {
    const { user_id } = req.body;
    const { data: user } = await supabase.from('users').select('*').eq('id', user_id).single();

    if (user.active_city === 'None') return res.json({ success: false, message: "Invest in a City first!" });

    await supabase.from('users').update({ balance: user.balance + 50 }).eq('id', user_id);
    res.json({ success: true, message: "Ksh 50 earned!" });
});

// --- WITHDRAWAL ROUTE ---
app.post('/withdraw', async (req, res) => {
    const { amount, user_id } = req.body;
    const withdrawAmount = parseFloat(amount);

    // 1. Check Minimum
    if (withdrawAmount < 500) {
        return res.json({ success: false, message: "Minimum withdrawal is Ksh 500" });
    }

    // 2. Fetch User Balance
    const { data: user, error: userError } = await supabase
        .from('users')
        .select('balance, phone')
        .eq('id', user_id)
        .single();

    if (!user || user.balance < withdrawAmount) {
        return res.json({ success: false, message: "Inadequate balance for this withdrawal." });
    }

    // 3. Deduct Balance & Create Pending Transaction
    const newBalance = user.balance - withdrawAmount;
    
    // Update balance
    await supabase.from('users').update({ balance: newBalance }).eq('id', user_id);

    // Record in transactions table for Admin to see
    const { error: transError } = await supabase.from('transactions').insert([
        { 
            user_id, 
            amount: withdrawAmount, 
            type: 'withdrawal', 
            status: 'pending', 
            evidence: `Withdrawal request from ${user.phone}` 
        }
    ]);

    if (transError) return res.json({ success: false, message: "Database Error. Try again." });

    res.json({ success: true, message: "Withdrawal request submitted! Admin will process it soon." });
});

// --- DEPOSIT ROUTE (Updated with Amount & Evidence) ---
app.post('/deposit', async (req, res) => {
    const { amount, evidence, user_id } = req.body;

    if (!amount || !evidence) {
        return res.json({ success: false, message: "Please provide both amount and M-PESA message." });
    }

    const { error } = await supabase.from('transactions').insert([
        { user_id, amount: parseFloat(amount), evidence, type: 'deposit', status: 'pending' }
    ]);

    if (error) return res.json({ success: false, message: "Error submitting deposit." });
    res.json({ success: true, message: "Top-up submitted! Wait for admin approval." });
});

// --- TASK CLAIMING (With City Limits) ---
const CITY_LIMITS = {
    'CITY A': 1, 'CITY B': 2, 'CITY C': 5, 'CITY D': 8, 'CITY E': 10
};

app.post('/claim_task', async (req, res) => {
    const { user_id } = req.body;
    const { data: user } = await supabase.from('users').select('*').eq('id', user_id).single();

    if (!user.active_city || user.active_city === 'None') {
        return res.json({ success: false, message: "Please join a City first!" });
    }

    const dailyLimit = CITY_LIMITS[user.active_city] || 0;
    
    // We assume you have a 'tasks_today' column in your DB
    if ((user.tasks_today || 0) >= dailyLimit) {
        return res.json({ success: false, message: `Task limit reached for ${user.active_city}!` });
    }

    const newBalance = user.balance + 50;
    const newTodayIncome = (user.todays_income || 0) + 50;
    const newTasksToday = (user.tasks_today || 0) + 1;

    await supabase.from('users').update({ 
        balance: newBalance, 
        todays_income: newTodayIncome,
        tasks_today: newTasksToday 
    }).eq('id', user_id);

    res.json({ success: true, message: "Ksh 50 added to your account!" });
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
