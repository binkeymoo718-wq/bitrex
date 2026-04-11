const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();

// --- CONFIGURATION ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Session config for Render
app.use(session({
    secret: 'city_platform_secret_9988',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// --- DATA STRUCTURES ---
let users = []; // In production, replace with MongoDB

const CITIES = {
    'CITY A': { price: 1500, dailyTasks: 1, dailyIncome: 50 },
    'CITY B': { price: 3200, dailyTasks: 2, dailyIncome: 100 },
    'CITY C': { price: 7200, dailyTasks: 4, dailyIncome: 200 },
    'CITY D': { price: 12000, dailyTasks: 8, dailyIncome: 400 },
    'CITY E': { price: 15000, dailyTasks: 10, dailyIncome: 500 }
};

// --- MIDDLEWARE ---
const isAuthenticated = (req, res, next) => {
    if (req.session.userPhone) {
        const user = users.find(u => u.phone === req.session.userPhone);
        if (user) {
            req.user = user;
            return next();
        }
    }
    res.redirect('/login');
};

// --- ROUTES ---

// 1. Auth Routes
app.get('/', (req, res) => {
    if (req.session.userPhone) return res.redirect('/dashboard');
    res.redirect('/login');
});

app.get('/signup', (req, res) => res.render('signup', { error: null }));

app.post('/signup', (req, res) => {
    const { phone, email, password, referralCode } = req.body;

    if (users.find(u => u.phone === phone)) {
        return res.render('signup', { error: 'Phone number already registered' });
    }

    const newUser = {
        phone,
        email,
        password,
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

    // Referral logic: Check if someone referred this user
    if (referralCode) {
        const referrer = users.find(u => u.myReferralCode === referralCode);
        if (referrer) {
            referrer.referralCount += 1;
            // Reward: 5 friends = 300 bonus
            if (referrer.referralCount === 5 && !referrer.bonusClaimed) {
                referrer.balance += 300;
                referrer.bonusClaimed = true;
                referrer.transactions.push({
                    type: 'Referral Bonus',
                    amount: 300,
                    date: new Date().toLocaleString()
                });
            }
        }
    }

    users.push(newUser);
    res.redirect('/login');
});

app.get('/login', (req, res) => res.render('login', { error: null }));

app.post('/login', (req, res) => {
    const { phone, password } = req.body;
    const user = users.find(u => u.phone === phone && u.password === password);
    
    if (!user) {
        return res.render('login', { error: 'Invalid phone or password' });
    }

    req.session.userPhone = user.phone;
    res.redirect('/dashboard');
});

// 2. Dashboard Route
app.get('/dashboard', isAuthenticated, (req, res) => {
    const user = req.user;

    // Reset Tasks at Midnight
    const today = new Date().toLocaleDateString();
    if (user.lastTaskDate !== today) {
        user.tasksDoneToday = 0;
        user.dailyIncome = 0;
        user.lastTaskDate = today;
    }

    // Calculate dynamic limits based on ALL joined cities
    let maxTasks = 0;
    user.investments.forEach(inv => {
        maxTasks += CITIES[inv.cityName].dailyTasks;
    });

    res.render('index', { user, cities: CITIES, maxTasks });
});

// 3. Investment Action
app.post('/invest', isAuthenticated, (req, res) => {
    const { cityName } = req.body;
    const user = req.user;
    const city = CITIES[cityName];

    if (!city) return res.json({ success: false, message: 'Invalid City' });

    if (user.balance >= city.price) {
        user.balance -= city.price;
        user.investments.push({
            cityName: cityName,
            dateJoined: new Date().toLocaleDateString(),
            daysActive: 1
        });
        user.transactions.push({
            type: 'Investment',
            amount: city.price,
            date: new Date().toLocaleString(),
            details: `Joined ${cityName}`
        });
        res.json({ success: true });
    } else {
        res.json({ success: false, message: 'Insufficient balance to join ' + cityName });
    }
});

// 4. Task Action
app.post('/do-task', isAuthenticated, (req, res) => {
    const user = req.user;
    
    // Calculate allowed tasks
    let maxTasks = 0;
    user.investments.forEach(inv => {
        maxTasks += CITIES[inv.cityName].dailyTasks;
    });

    if (maxTasks === 0) {
        return res.json({ success: false, message: 'Please invest in a city first!' });
    }

    if (user.tasksDoneToday >= maxTasks) {
        return res.json({ success: false, message: 'Number of task limit reached' });
    }

    // Complete Task
    user.tasksDoneToday += 1;
    user.balance += 50;
    user.dailyIncome += 50;
    user.totalEarnings += 50;
    
    res.json({ success: true, newBalance: user.balance });
});

// 5. Wallet Routes
app.post('/deposit', isAuthenticated, (req, res) => {
    const { amount, evidence } = req.body;
    if (amount < 300) return res.send("Minimum deposit is 300");

    // In a real app, this would be marked as "Pending" for admin approval
    // For this workable version, we add it immediately
    req.user.balance += parseInt(amount);
    req.user.transactions.push({
        type: 'Deposit',
        amount: amount,
        date: new Date().toLocaleString(),
        status: 'Completed'
    });
    res.redirect('/dashboard');
});

app.post('/withdraw', isAuthenticated, (req, res) => {
    const { amount, phone, password } = req.body;
    const user = req.user;

    if (amount < 500) return res.json({ success: false, message: 'Min withdrawal Ksh 500' });
    if (user.balance < amount) return res.json({ success: false, message: 'Insufficient balance' });

    user.balance -= parseInt(amount);
    user.transactions.push({
        type: 'Withdrawal',
        amount: amount,
        date: new Date().toLocaleString(),
        status: 'Pending'
    });
    res.json({ success: true });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// --- SERVER START ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
