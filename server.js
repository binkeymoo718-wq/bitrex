const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const session = require('express-session');
const app = express();

// --- CONFIGURATION ---
const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_KEY
);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'bitrex_secret_key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// --- PAGE ROUTES ---

app.get('/', (req, res) => res.redirect('/login'));
app.get('/signup', (req, res) => res.render('signup'));
app.get('/login', (req, res) => res.render('login'));

app.get('/dashboard', async (req, res) => {
    const user_id = req.session.user_id;
    if (!user_id) return res.redirect('/login');

    try {
        const { data: user } = await supabase.from('users').select('*').eq('id', user_id).single();
        const { data: userCities } = await supabase.from('user_cities').select('*').eq('user_id', user_id);

        res.render('index', { 
            user: user, 
            userCities: userCities || [] 
        });
    } catch (err) {
        res.status(500).send("Dashboard Error: Check database connection.");
    }
});

// --- AUTH LOGIC ---

app.post('/signup', async (req, res) => {
    const { name, phone, password } = req.body;
    const { error } = await supabase.from('users').insert([{ 
        name, phone, password, balance: 0, total_income: 0, todays_income: 0, monthly_income: 0 
    }]);
    if (error) return res.send("Error: " + error.message);
    res.redirect('/login');
});

app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    const { data: user } = await supabase.from('users').select('*').eq('phone', phone).eq('password', password).single();

    if (user) {
        req.session.user_id = user.id;
        res.redirect('/dashboard');
    } else {
        res.send("<script>alert('Invalid login'); window.location='/login';</script>");
    }
});

// --- COMPLETED DEPOSIT LOGIC ---
app.post('/deposit', async (req, res) => {
    const { amount, evidence, user_id } = req.body;
    if (!amount || !evidence) return res.json({ success: false, message: "Provide amount and evidence." });

    // Insert into transactions for Admin approval
    const { error } = await supabase.from('transactions').insert([{ 
        user_id, 
        amount: parseFloat(amount), 
        evidence, 
        type: 'deposit', 
        status: 'pending' 
    }]);

    if (error) return res.json({ success: false, message: "Deposit failed to submit." });
    res.json({ success: true, message: "Top-up submitted! Wait for Admin approval." });
});

// --- COMPLETED WITHDRAWAL LOGIC ---
app.post('/withdraw', async (req, res) => {
    const { amount, user_id } = req.body;
    const withdrawAmt = parseFloat(amount);

    if (withdrawAmt < 500) return res.json({ success: false, message: "Min withdrawal is Ksh 500" });

    const { data: user } = await supabase.from('users').select('balance').eq('id', user_id).single();
    if (!user || user.balance < withdrawAmt) return res.json({ success: false, message: "Inadequate balance." });

    // 1. Deduct immediately from balance
    const { error: updateError } = await supabase.from('users').update({ balance: user.balance - withdrawAmt }).eq('id', user_id);
    
    // 2. Create pending transaction record
    await supabase.from('transactions').insert([{ 
        user_id, amount: withdrawAmt, type: 'withdrawal', status: 'pending' 
    }]);

    if (updateError) return res.json({ success: false, message: "Withdrawal failed." });
    res.json({ success: true, message: "Withdrawal requested!" });
});

// --- COMPLETED TASK LOGIC (SUMS ALL CITIES) ---
app.post('/claim_task', async (req, res) => {
    const { user_id } = req.body;

    // Fetch user and their city investments
    const { data: user } = await supabase.from('users').select('*').eq('id', user_id).single();
    const { data: cities } = await supabase.from('user_cities').select('daily_income').eq('user_id', user_id);

    if (!cities || cities.length === 0) return res.json({ success: false, message: "Join a city first!" });
    if (user.tasks_today >= 1) return res.json({ success: false, message: "Daily task already claimed." });

    // Sum income from every city user has joined
    const totalReward = cities.reduce((sum, c) => sum + (c.daily_income || 0), 0);
    const newBalance = parseInt(user.balance || 0) + totalReward;

    const { error } = await supabase.from('users').update({
        balance: newBalance,
        todays_income: totalReward,
        total_income: parseInt(user.total_income || 0) + totalReward,
        tasks_today: 1 
    }).eq('id', user_id);

    if (error) return res.json({ success: false, message: "Task update failed." });
    res.json({ success: true, message: `Ksh ${totalReward} earned!` });
});

// --- INVESTMENT LOGIC ---
app.post('/invest', async (req, res) => {
    const { city, cost, user_id } = req.body;
    const incomeMap = { 'CITY A': 50, 'CITY B': 100, 'CITY C': 250, 'CITY D': 400, 'CITY E': 500 };

    const { data: user } = await supabase.from('users').select('balance').eq('id', user_id).single();
    if (user.balance < cost) return res.json({ success: false, message: "Inadequate balance" });

    await supabase.from('users').update({ balance: user.balance - cost }).eq('id', user_id);
    await supabase.from('user_cities').insert([{ 
        user_id, city_name: city, daily_income: incomeMap[city] 
    }]);

    res.json({ success: true, message: `Successfully joined ${city}!` });
});

// --- START ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`BITREX Live on port ${PORT}`));
