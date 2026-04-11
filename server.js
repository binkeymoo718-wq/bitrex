const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const DATA_FILE = path.join(__dirname, 'database.json');

// --- DATABASE HELPERS ---
// This ensures users are saved even if the server restarts
function loadUsers() {
    try {
        if (!fs.existsSync(DATA_FILE)) return [];
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Error loading database:", error);
        return [];
    }
}

function saveUsers(users) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 4));
    } catch (error) {
        console.error("Error saving database:", error);
    }
}

// --- CONFIGURATION ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(session({
    secret: 'business_platform_2024_secure',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 Hours
}));

// --- BUSINESS CONSTANTS ---
const CITIES = {
    'CITY A': { price: 1500, dailyTasks: 1, incomePerTask: 50 },
    'CITY B': { price: 3200, dailyTasks: 2, incomePerTask: 50 },
    'CITY C': { price: 7200, dailyTasks: 4, incomePerTask: 50 },
    'CITY D': { price: 12000, dailyTasks: 8, incomePerTask: 50 },
    'CITY E': { price: 15000, dailyTasks: 10, incomePerTask: 50 }
};

// --- AUTH MIDDLEWARE ---
const isAuth = (req, res, next) => {
    if (req.session.userPhone) {
        let users = loadUsers();
        let user = users.find(u => u.phone === req.session.userPhone);
        if (user) {
            req.user = user;
            return next();
        }
    }
    res.redirect('/login');
};

// --- ROUTES ---

// 1. Signup
app.get('/signup', (req, res) => res.render('signup', { error: null }));
app.post('/signup', (req, res) => {
    let { phone, email, password, referralCode } = req.body;
    let users = loadUsers();

    // Force phone to string to prevent login errors
    phone = String(phone).trim();

    if (users.find(u => u.phone === phone)) {
        return res.render('signup', { error: 'Phone number already registered' });
    }

    const newUser = {
        phone: phone,
        email: email,
        password: String(password),
        balance: 0,
        totalEarnings: 0,
        dailyIncome: 0,
        investments: [], // Stores { cityName, dateJoined }
        tasksDoneToday: 0,
        lastTaskDate: new Date().toLocaleDateString(),
        myReferralCode: "REF" + Math.floor(1000 + Math.random() * 9000),
        referralCount: 0,
        bonusClaimed: false,
        transactions: []
    };

    // Referral Bonus Check
    if (referralCode) {
        let referrer = users.find(u => u.myReferralCode === referralCode.trim());
        if (referrer) {
            referrer.referralCount += 1;
            if (referrer.referralCount === 5 && !referrer.bonusClaimed) {
                referrer.balance += 300;
                referrer.bonusClaimed = true;
                referrer.transactions.push({ type: 'Referral Bonus', amount: 300, date: new Date().toLocaleString() });
            }
        }
    }

    users.push(newUser);
    saveUsers(users);
    res.redirect('/login');
});

// 2. Login
app.get('/login', (req, res) => res.render('login', { error: null }));
app.post('/login', (req, res) => {
    let { phone, password } = req.body;
    let users = loadUsers();

    // Data Normalization
    phone = String(phone).trim();
    password = String(password);

    const user = users.find(u => u.phone === phone && u.password === password);

    if (user) {
        req.session.userPhone = user.phone;
        res.redirect('/dashboard');
    } else {
        res.render('login', { error: 'Invalid phone or password' });
    }
});

// 3. Dashboard (Home)
app.get('/dashboard', isAuth, (req, res) => {
    let users = loadUsers();
    let user = users.find(u => u.phone === req.user.phone);

    // Midnight Reset Logic
    const today = new Date().toLocaleDateString();
    if (user.lastTaskDate !== today) {
        user.tasksDoneToday = 0;
        user.dailyIncome = 0;
        user.lastTaskDate = today;
        saveUsers(users);
    }

    // Summing task limits from all joined cities
    let totalMaxTasks = 0;
    user.investments.forEach(inv => {
        totalMaxTasks += CITIES[inv.cityName].dailyTasks;
    });

    res.render('index', { user, cities: CITIES, maxTasks: totalMaxTasks });
});

// 4. Investment Logic
app.post('/invest', isAuth, (req, res) => {
    const { cityName } = req.body;
    let users = loadUsers();
    let user = users.find(u => u.phone === req.user.phone);
    const city = CITIES[cityName];

    if (user.balance >= city.price) {
        user.balance -= city.price;
        user.investments.push({ cityName, dateJoined: new Date().toLocaleDateString() });
        user.transactions.push({ type: 'Investment', amount: city.price, date: new Date().toLocaleString(), details: cityName });
        saveUsers(users);
        res.json({ success: true });
    } else {
        res.json({ success: false, message: 'Insufficient balance' });
    }
});

// 5. Task Logic
app.post('/do-task', isAuth, (req, res) => {
    let users = loadUsers();
    let user = users.find(u => u.phone === req.user.phone);

    let totalMaxTasks = 0;
    user.investments.forEach(inv => totalMaxTasks += CITIES[inv.cityName].dailyTasks);

    if (totalMaxTasks === 0) return res.json({ success: false, message: 'Invest in a city first' });
    if (user.tasksDoneToday >= totalMaxTasks) return res.json({ success: false, message: 'Number of task limit reached' });

    user.tasksDoneToday += 1;
    user.balance += 50;
    user.dailyIncome += 50;
    user.totalEarnings += 50;

    saveUsers(users);
    res.json({ success: true, balance: user.balance });
});

// 6. Wallet
app.post('/deposit', isAuth, (req, res) => {
    const { amount, evidence } = req.body;
    let users = loadUsers();
    let user = users.find(u => u.phone === req.user.phone);

    if (amount < 300) return res.send("Min deposit is 300");

    user.balance += parseInt(amount);
    user.transactions.push({ type: 'Deposit', amount, date: new Date().toLocaleString(), status: 'Confirmed' });
    saveUsers(users);
    res.redirect('/dashboard');
});

app.post('/withdraw', isAuth, (req, res) => {
    const { amount } = req.body;
    let users = loadUsers();
    let user = users.find(u => u.phone === req.user.phone);

    if (amount < 500) return res.json({ success: false, message: 'Min withdrawal 500' });
    if (user.balance < amount) return res.json({ success: false, message: 'Insufficient balance' });

    user.balance -= parseInt(amount);
    user.transactions.push({ type: 'Withdrawal', amount, date: new Date().toLocaleString(), status: 'Pending' });
    saveUsers(users);
    res.json({ success: true });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// --- START SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server live on port ${PORT}`));
