const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const DATA_FILE = path.join(__dirname, 'database.json');

// --- MIDDLEWARE ---
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: 'city_secret_998877',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// --- DATABASE LOGIC ---
function loadUsers() {
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify([]));
        return [];
    }
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data || "[]");
}

function saveUsers(users) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
}

// --- ROUTES ---

// Login Page
app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

// Signup Page
app.get('/signup', (req, res) => {
    res.render('signup', { error: null });
});

// SIGNUP LOGIC
app.post('/signup', (req, res) => {
    let { phone, email, password, referralCode } = req.body;
    let users = loadUsers();

    // Clean data
    phone = String(phone).trim();
    password = String(password).trim();

    if (users.find(u => u.phone === phone)) {
        return res.render('signup', { error: 'Phone already exists!' });
    }

    const newUser = {
        phone, email, password,
        balance: 0,
        totalEarnings: 0,
        dailyIncome: 0,
        investments: [],
        tasksDoneToday: 0,
        lastTaskDate: new Date().toLocaleDateString(),
        myReferralCode: "REF" + Math.floor(1000 + Math.random() * 9000),
        referralCount: 0,
        bonusClaimed: false,
        transactions: []
    };

    users.push(newUser);
    saveUsers(users);

    console.log("SUCCESS: New user registered:", phone);
    
    // AUTO-LOGIN: This bypasses the login screen after signup
    req.session.userPhone = phone;
    res.redirect('/dashboard');
});

// LOGIN LOGIC
app.post('/login', (req, res) => {
    let { phone, password } = req.body;
    let users = loadUsers();

    phone = String(phone).trim();
    password = String(password).trim();

    console.log("Login Attempt:", phone, "Password:", password);

    const user = users.find(u => u.phone === phone && u.password === password);

    if (user) {
        req.session.userPhone = user.phone;
        console.log("Login Success for:", phone);
        res.redirect('/dashboard');
    } else {
        console.log("Login Failed for:", phone);
        res.render('login', { error: 'Invalid phone or password' });
    }
});

// Dashboard
app.get('/dashboard', (req, res) => {
    if (!req.session.userPhone) return res.redirect('/login');
    
    let users = loadUsers();
    let user = users.find(u => u.phone === req.session.userPhone);
    
    if (!user) return res.redirect('/login');

    res.render('index', { 
        user, 
        cities: {
            'CITY A': { price: 1500, dailyTasks: 1, incomePerTask: 50 },
            'CITY B': { price: 3200, dailyTasks: 2, incomePerTask: 50 },
            'CITY C': { price: 7200, dailyTasks: 4, incomePerTask: 50 },
            'CITY D': { price: 12000, dailyTasks: 8, incomePerTask: 50 },
            'CITY E': { price: 15000, dailyTasks: 10, incomePerTask: 50 }
        },
        maxTasks: 0 // Logic for summing cities goes here
    });
});

app.get('/', (req, res) => res.redirect('/login'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
