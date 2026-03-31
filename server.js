require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();

// 1. DATABASE CONFIGURATION
// This pulls the URL and KEY directly from your Render Environment tab
const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_KEY
);

// 2. APP MIDDLEWARE
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'bitrex-secure-session-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS in production
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 3. ROUTES

// --- SIGNUP ROUTE ---
app.post('/auth/signup', async (req, res) => {
    const { phone, email, password, refCode } = req.body;

    // Generate a unique referral code for the new user
    const newUserReferralCode = 'BTX' + Math.random().toString(36).toUpperCase().substring(2, 7);

    const { data, error } = await supabase
        .from('users')
        .insert([{ 
            phone: phone.trim(), 
            email: email.trim(), 
            password: password.trim(), 
            referred_by: refCode || null,
            referral_code: newUserReferralCode,
            balance: 0,
            total_earnings: 0,
            tasks_today: 0
        }]);

    if (error) {
        // Handle duplicate phone/email without crashing
        if (error.code === '23505') {
            return res.status(400).json({ success: false, message: "Phone or Email already registered." });
        }
        return res.status(500).json({ success: false, message: error.message });
    }

    res.status(201).json({ success: true, message: "Registration successful!", referral_code: newUserReferralCode });
});

// --- LOGIN ROUTE ---
app.post('/auth/login', async (req, res) => {
    const { phone, password } = req.body;

    if (!phone || !password) {
        return res.status(400).json({ success: false, message: "Phone and password required." });
    }

    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('phone', phone.trim())
        .eq('password', password.trim())
        .maybeSingle(); // Prevents crash if duplicates exist

    if (error || !user) {
        return res.status(401).json({ success: false, message: "Invalid phone number or password." });
    }

    // Save user to session
    req.session.user = user;
    
    res.status(200).json({ 
        success: true, 
        message: "Login successful!", 
        user: { phone: user.phone, balance: user.balance } 
    });
});

// --- DASHBOARD ---
app.get('/', (req, res) => {
    res.render('index', { user: req.session.user || null });
});

// --- LOGOUT ---
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// 4. START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`BITREX active on port ${PORT}`);
});
