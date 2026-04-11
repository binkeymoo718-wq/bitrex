const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs'); // Added for file saving

const app = express();
const DATA_FILE = './users.json';

// --- HELPER FUNCTIONS TO PERSIST DATA ---
// This ensures your users don't disappear when the server restarts
function loadUsers() {
    if (!fs.existsSync(DATA_FILE)) return [];
    const data = fs.readFileSync(DATA_FILE);
    return JSON.parse(data);
}

function saveUsers(users) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
}

// --- CONFIGURATION ---
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(session({
    secret: 'city_platform_secret_123',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

const CITIES = {
    'CITY A': { price: 1500, dailyTasks: 1, dailyIncome: 50 },
    'CITY B': { price: 3200, dailyTasks: 2, dailyIncome: 100 },
    'CITY C': { price: 7200, dailyTasks: 4, dailyIncome: 200 },
    'CITY D': { price: 12000, dailyTasks: 8, dailyIncome: 400 },
    'CITY E': { price: 15000, dailyTasks: 10, dailyIncome: 500 }
};

// --- ROUTES ---

app.get('/', (req, res) => res.redirect('/login'));

app.get('/signup', (req, res) => res.render('signup', { error: null }));

app.post('/signup', (req, res) => {
    let users = loadUsers();
    const { phone, email, password, referralCode } = req.body;

    // Check if phone exists (converting both to string to be safe)
    if (users.find(u => String(u.phone) === String(phone))) {
        return res.render('signup', { error: 'Phone number already registered' });
    }

    const newUser = {
        phone: String(phone),
        email,
        password: String(password),
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

    // Referral Logic
    if (referralCode) {
        const referrer = users.find(u => u.myReferralCode === referralCode);
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
    saveUsers(users); // Save to users.json
    res.redirect('/login');
});

app.get('/login', (req, res) => res.render('login', { error: null }));

app.post('/login', (req, res) => {
    const { phone, password } = req.body;
    const users = loadUsers();
    
    // Debugging logs (Check your Render logs to see these)
    console.log("Login attempt for:", phone);
    
    const user = users.find(u => String(u.phone) === String(phone) && String(u.password) === String(password));
    
    if (!user) {
        console.log("Login failed: User not found or password wrong");
        return res.render('login', { error: 'Invalid phone or password' });
    }

    req.session.userPhone = user.phone;
    res.redirect('/dashboard');
});

app.get('/dashboard', (req, res) => {
    if (!req.session.userPhone) return res.redirect('/login');
    
    const users = loadUsers();
    const user = users.find(u => u.phone === req.session.userPhone);
    
    if (!user) return res.redirect('/login');

    // Midnight Reset
    const today = new Date().toLocaleDateString();
    if (user.lastTaskDate !== today) {
        user.tasksDoneToday = 0;
        user.dailyIncome = 0;
        user.lastTaskDate = today;
        saveUsers(users);
    }

    let maxTasks = 0;
    user.investments.forEach(inv => {
        maxTasks += CITIES[inv.cityName].dailyTasks;
    });

    res.render('index', { user, cities: CITIES, maxTasks });
});

// Task route
app.post('/do-task', (req, res) => {
    if (!req.session.userPhone) return res.json({success: false});
    
    let users = loadUsers();
    let user = users.find(u => u.phone === req.session.userPhone);

    let maxTasks = 0;
    user.investments.forEach(inv => maxTasks += CITIES[inv.cityName].dailyTasks);

    if (user.tasksDoneToday >= maxTasks) {
        return res.json({ success: false, message: 'Number of task limit reached' });
    }

    user.tasksDoneToday += 1;
    user.balance += 50;
    user.dailyIncome += 50;
    user.totalEarnings += 50;

    saveUsers(users);
    res.json({ success: true, newBalance: user.balance });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
