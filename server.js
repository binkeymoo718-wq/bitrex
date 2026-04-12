const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: 'bitrex_secret_key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS, but false is fine for now
}));

// Mock Database (IMPORTANT: On Render Free Tier, this resets every restart)
let users = []; 

const CITIES = {
    "CITY A": { price: 1500, daily: 50, tasks: 1 },
    "CITY B": { price: 3200, daily: 100, tasks: 2 },
    "CITY C": { price: 7200, daily: 200, tasks: 4 },
    "CITY D": { price: 12000, daily: 400, tasks: 8 },
    "CITY E": { price: 15000, daily: 500, tasks: 10 }
};

const TASK_LIST = [
    "2.5L Vaccum Flask", "Mini massage gun", "Blood glucose machine", "Electric blender",
    "Modern soldering gun", "Television set", "Electric meter", "Smart phones",
    "HD Camera High pixel", "Iron sheets", "Plumbing tools", "Furniture",
    "Wi-Fi systems", "Laptops", "Textiles", "Paints", "Cosmetics", "Electrical tools",
    "Shoes", "Gas cookers", "Electric heater", "Air Fryer (4L or 5L)", 
    "Electric Pressure Cooker", "Microwave Oven", "Non-stick Cookware Set",
    "Water Dispenser", "Rechargeable Juicer Cup", "Electric Kettle",
    "Subwoofer System", "Android TV Box", "Bluetooth Speaker", "Gaming Console",
    "Smart Watch", "Wireless Earbuds", "Solar Lighting System"
];

// Routes
app.get('/', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.render('login', { error: null });
});

app.get('/signup', (req, res) => res.render('signup', { error: null }));

app.post('/signup', (req, res) => {
    const { phone, email, password, referralCode } = req.body;
    if (password.length < 6 || password.length > 8) {
        return res.render('signup', { error: "Password must be 6-8 characters." });
    }
    // Check if user exists
    if(users.find(u => u.phone === phone)) return res.render('signup', { error: "Phone number already registered." });

    const newUser = {
        phone, email, password,
        balance: 0,
        activeCities: [],
        tasksDoneToday: 0,
        totalEarnings: 0,
        todayIncome: 0,
        referralCode: "BIT" + Math.floor(1000 + Math.random() * 9000),
        referralsCount: 0,
        history: [],
        lastTaskDate: new Date().toLocaleDateString()
    };
    users.push(newUser);
    req.session.user = newUser;
    res.redirect('/dashboard');
});

app.post('/login', (req, res) => {
    const { phone, password } = req.body;
    const user = users.find(u => u.phone === phone && u.password === password);
    if (user) {
        req.session.user = user;
        const today = new Date().toLocaleDateString();
        if (user.lastTaskDate !== today) {
            user.tasksDoneToday = 0;
            user.todayIncome = 0;
            user.lastTaskDate = today;
        }
        res.redirect('/dashboard');
    } else {
        res.render('login', { error: "Invalid phone or password" });
    }
});

app.get('/dashboard', (req, res) => {
    if (!req.session.user) return res.redirect('/');
    res.render('index', { user: req.session.user, cities: CITIES, tasks: TASK_LIST });
});

app.post('/invest', (req, res) => {
    const user = users.find(u => u.phone === req.session.user.phone);
    const { cityName } = req.body;
    const city = CITIES[cityName];
    
    if (user.balance >= city.price) {
        user.balance -= city.price;
        user.activeCities.push({ name: cityName, date: new Date().toLocaleDateString() });
        user.history.push({ type: 'Investment', amount: city.price, date: new Date().toLocaleString() });
        req.session.user = user;
        res.json({ success: true });
    } else {
        res.json({ success: false, message: "Insufficient balance. Minimum deposit for this city is Ksh " + city.price });
    }
});

app.post('/do-task', (req, res) => {
    const user = users.find(u => u.phone === req.session.user.phone);
    if (user.activeCities.length === 0) return res.json({ success: false, message: "Please join a city first!" });

    let maxTasks = 0;
    user.activeCities.forEach(city => {
        maxTasks += CITIES[city.name].tasks;
    });

    if (user.tasksDoneToday >= maxTasks) {
        return res.json({ success: false, message: "Number of task limit reached" });
    }

    user.tasksDoneToday += 1;
    user.balance += 50;
    user.todayIncome += 50;
    user.totalEarnings += 50;
    req.session.user = user;
    res.json({ success: true, balance: user.balance, todayIncome: user.todayIncome });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.listen(PORT, '0.0.0.0', () => console.log(`BITREX running on port ${PORT}`));
