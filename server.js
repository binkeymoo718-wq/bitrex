const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const session = require('express-session'); // Added for stable login sessions
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

// Session setup to prevent "Internal Server Error" on dashboard load
app.use(session({
    secret: 'bitrex_secret_key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// --- PAGE ROUTES ---

app.get('/', (req, res) => res.redirect('/login'));
app.get('/signup', (req, res) => res.render('signup'));
app.get('/login', (req, res) => res.render('login'));

// Updated Dashboard: Fetches User + All Joined Cities
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
        console.error(err);
        res.status(500).send("Internal Server Error: Check database columns.");
    }
});

// --- AUTH LOGIC ---

app.post('/signup', async (req, res) => {
    const { name, phone, password } = req.body;
    const { error } = await supabase.from('users').insert([{ 
        name, phone, password, balance: 0, total_income: 0, todays_income: 0 
    }]);
    if (error) return res.send("Error: " + error.message);
    res.redirect('/login');
});

app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    const { data: user, error } = await supabase.from('users')
        .select('*')
        .eq('phone', phone)
        .eq('password', password)
        .single();

    if (user) {
        req.session.user_id = user.id; // Store ID in session
        res.redirect('/dashboard');
    } else {
        res.send("<script>alert('Invalid login details.'); window.location='/login';</script>");
    }
});

// --- CORE FEATURES ---

// 1. Multi-City Investment: Adds a new record instead of overwriting
app.post('/invest', async (req, res) => {
    const { city, cost, user_id } = req.body;
    const incomeMap = { 'CITY A': 50, 'CITY B': 100, 'CITY C': 250, 'CITY D': 400, 'CITY E': 500 };

    const { data: user } = await supabase.from('users').select('balance').eq('id', user_id).single();
    if (user.balance < cost) return res.json({ success: false, message: "Inadequate balance" });

    // Deduct balance and record the NEW city in the user_cities table
    await supabase.from('users').update({ balance: user.balance - cost }).eq('id', user_id);
    await supabase.from('user_cities').insert([{ 
        user_id, 
        city_name: city, 
        daily_income: incomeMap[city] 
    }]);

    res.json({ success: true, message: `Successfully joined ${city}!` });
});

// 2. Claim Task: Sums all cities and fixes balance not increasing
app.post('/claim_task', async (req, res) => {
    const { user_id } = req.body;

    const { data: user } = await supabase.from('users').select('*').eq('id', user_id).single();
    const { data: cities } = await supabase.from('user_cities').select('daily_income').eq('user_id', user_id);

    if (!cities || cities.length === 0) return res.json({ success: false, message: "Join a city first!" });
    if (user.tasks_today >= 1) return res.json({ success: false, message: "Tasks already completed today!" });

    // Calculate total reward from all cities combined
    const totalDailyReward = cities.reduce((sum, c) => sum + (c.daily_income || 0), 0);
    
    // Explicit math with parseInt to ensure balance increases
    const newBalance = parseInt(user.balance || 0) + totalDailyReward;

    await supabase.from('users').update({
        balance: newBalance,
        todays_income: totalDailyReward,
        total_income: parseInt(user.total_income || 0) + totalDailyReward,
        tasks_today: 1 
    }).eq('id', user_id);

    res.json({ success: true, message: `Ksh ${totalDailyReward} added to balance!` });
});

// 3. Withdrawal: Ksh 500 Minimum
app.post('/withdraw', async (req, res) => {
    const { amount, user_id } = req.body;
    const withdrawAmount = parseFloat(amount);

    if (withdrawAmount < 500) return res.json({ success: false, message: "Minimum withdrawal is Ksh 500" });

    const { data: user } = await supabase.from('users').select('balance').eq('id', user_id).single();
    if (user.balance < withdrawAmount) return res.json({ success: false, message: "Inadequate balance" });

    await supabase.from('users').update({ balance: user.balance - withdrawAmount }).eq('id', user_id);
    await supabase.from('transactions').insert([{ 
        user_id, amount: withdrawAmount, type: 'withdrawal', status: 'pending' 
    }]);

    res.json({ success: true, message: "Withdrawal submitted for admin approval!" });
});

// 4. Deposit with Evidence
app.post('/deposit', async (req, res) => {
    const { amount, evidence, user_id } = req.body;
    if (!amount || !evidence) return res.json({ success: false, message: "Fill all fields" });

    await supabase.from('transactions').insert([{ 
        user_id, amount: parseFloat(amount), evidence, type: 'deposit', status: 'pending' 
    }]);
    res.json({ success: true, message: "Top-up submitted!" });
});

// --- ADMIN FEATURES ---

app.get('/admin/dashboard', async (req, res) => {
    const { data } = await supabase.from('transactions').select('*').eq('status', 'pending');
    res.render('admin', { pendingTransactions: data || [] });
});

app.post('/admin/approve', async (req, res) => {
    const { trans_id, user_id, amount, type } = req.body;

    await supabase.from('transactions').update({ status: 'approved' }).eq('id', trans_id);

    if (type === 'deposit') {
        const { data: user } = await supabase.from('users').select('balance').eq('id', user_id).single();
        await supabase.from('users').update({ balance: user.balance + parseFloat(amount) }).eq('id', user_id);
    }

    res.json({ success: true, message: "Action approved!" });
});

// --- START ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`BITREX Live on port ${PORT}`));
