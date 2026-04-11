const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();

// Middleware
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: 'city-secret-key',
    resave: false,
    saveUninitialized: true
}));

// Mock Database (In production, use MongoDB)
let users = []; 

// City Configurations
const CITIES = {
    'CITY A': { price: 1500, dailyTasks: 1, dailyIncome: 50 },
    'CITY B': { price: 3200, dailyTasks: 2, dailyIncome: 100 },
    'CITY C': { price: 7200, dailyTasks: 4, dailyIncome: 200 },
    'CITY D': { price: 12000, dailyTasks: 8, dailyIncome: 400 },
    'CITY E': { price: 15000, dailyTasks: 10, dailyIncome: 500 }
};

// Middleware to check auth
const isAuthenticated = (req, res, next) => {
    if (req.session.userPhone) return next();
    res.redirect('/login');
};

// Routes
app.get('/', (req, res) => res.redirect('/dashboard'));

app.get('/signup', (req, res) => res.render('signup', { error: null }));
app.post('/signup', (req, res) => {
    const { phone, email, password, referralCode } = req.body;
    if (users.find(u => u.phone === phone)) return res.render('signup', { error: 'Phone already exists' });

    const newUser = {
        phone, email, password, referralCode,
        balance: 0,
        totalEarnings: 0,
        dailyIncome: 0,
        investments: [], // Array of {cityName, dateJoined}
        tasksDoneToday: 0,
        lastTaskDate: new Date().toLocaleDateString(),
        myReferralCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
        referralCount: 0,
        bonusClaimed: false,
        transactions: []
    };
    users.push(newUser);
    res.redirect('/login');
});

app.get('/login', (req, res) => res.render('login', { error: null }));
app.post('/login', (req, res) => {
    const { phone, password } = req.body;
    const user = users.find(u => u.phone === phone && u.password === password);
    if (!user) return res.render('login', { error: 'Invalid credentials' });
    req.session.userPhone = user.phone;
    res.redirect('/dashboard');
});

app.get('/dashboard', isAuthenticated, (req, res) => {
    const user = users.find(u => u.phone === req.session.userPhone);
    
    // Midnight Reset Logic
    const today = new Date().toLocaleDateString();
    if (user.lastTaskDate !== today) {
        user.tasksDoneToday = 0;
        user.dailyIncome = 0;
        user.lastTaskDate = today;
    }

    // Calculate Limits
    let maxTasks = 0;
    user.investments.forEach(inv => {
        maxTasks += CITIES[inv.cityName].dailyTasks;
    });

    res.render('index', { user, cities: CITIES, maxTasks, activeTab: 'home' });
});

// Investment Logic
app.post('/invest', isAuthenticated, (req, res) => {
    const { cityName } = req.body;
    const user = users.find(u => u.phone === req.session.userPhone);
    const city = CITIES[cityName];

    if (user.balance >= city.price) {
        user.balance -= city.price;
        user.investments.push({ cityName, dateJoined: new Date().toLocaleDateString() });
        user.transactions.push({ type: 'Investment', amount: city.price, date: new Date().toLocaleString() });
        res.json({ success: true });
    } else {
        res.json({ success: false, message: 'Insufficient balance' });
    }
});

// Task Completion Logic
app.post('/do-task', isAuthenticated, (req, res) => {
    const user = users.find(u => u.phone === req.session.userPhone);
    let maxTasks = 0;
    user.investments.forEach(inv => maxTasks += CITIES[inv.cityName].dailyTasks);

    if (user.tasksDoneToday >= maxTasks) {
        return res.json({ success: false, message: 'Number of task limit reached' });
    }

    user.tasksDoneToday += 1;
    user.balance += 50;
    user.dailyIncome += 50;
    user.totalEarnings += 50;
    res.json({ success: true, balance: user.balance });
});

// Deposit/Withdraw Logic
app.post('/deposit', isAuthenticated, (req, res) => {
    const user = users.find(u => u.phone === req.session.userPhone);
    const { amount } = req.body;
    if (amount < 300) return res.send("Min deposit 300");
    // Manual approval logic would go here
    user.balance += parseInt(amount);
    user.transactions.push({ type: 'Deposit', amount, date: new Date().toLocaleString() });
    res.redirect('/dashboard');
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));
