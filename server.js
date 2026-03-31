require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();

// 1. DATABASE CONFIGURATION (Supabase)
// This tells the code to look at the "Environment Variables" you set in Render
const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_KEY
); 

// 2. APP MIDDLEWARE
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'bitrex-secret-key',
    resave: false,
    saveUninitialized: true
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 3. ROUTES

// SIGNUP ROUTE (With Duplicate Fix)
app.post('/auth/signup', async (req, res) => {
    const { phone, email, password, refCode } = req.body;

    // Generate a unique referral code for the new user
    const newUserReferralCode = 'BTX' + Math.random().toString(36).toUpperCase().substring(2, 7);

    const { data, error } = await supabase
        .from('users')
        .insert([{ 
            phone, 
            email, 
            password, 
            referred_by: refCode || null,
            referral_code: newUserReferralCode,
            balance: 0,
            total_earnings: 0,
            tasks_today: 0
        }]);

    if (error) {
        // FIX: Catch the "Unique Violation" error so the server doesn't crash
        if (error.code === '23505') {
            return res.status(400).json({ 
                success: false, 
                message: "This phone number or email is already registered." 
            });
        }
        console.error("Signup Error:", error.message);
        return res.status(500).json({ success: false, message: "Server error during registration." });
    }

    res.status(201).json({ 
        success: true, 
        message: "Registration successful!", 
        referral_code: newUserReferralCode 
    });
});

// LOGIN ROUTE
app.post('/auth/login', async (req, res) => {
    const { phone, password } = req.body;

    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('phone', phone)
        .eq('password', password)
        .single();

    if (error || !user) {
        return res.status(401).send('Invalid phone number or password.');
    }

    req.session.user = user;
    res.redirect('/');
});

// DASHBOARD ROUTE
app.get('/', (req, res) => {
    res.render('index', { user: req.session.user || null });
});

// LOGOUT
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// 4. START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`BITREX server is running on port ${PORT}`);
});
