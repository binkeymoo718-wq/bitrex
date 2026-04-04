const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const session = require('express-session');
require('dotenv').config();

const app = express();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'bitrex_final_99',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } 
}));

const CITIES = {
    'CITY A': { cost: 1500, daily: 50, tasks: 1 },
    'CITY B': { cost: 3200, daily: 100, tasks: 2 },
    'CITY C': { cost: 7200, daily: 200, tasks: 4 },
    'CITY D': { cost: 12000, daily: 400, tasks: 8 },
    'CITY E': { cost: 15000, daily: 500, tasks: 10 }
};

// --- AUTH & NAVIGATION ---
app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', (req, res) => res.render('login'));
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    const { data: user } = await supabase.from('users').select('*').eq('phone', phone).eq('password', password).single();
    if (user) { 
        req.session.user_id = user.id; 
        res.redirect('/dashboard'); 
    } else { 
        res.send("Invalid details."); 
    }
});

app.get('/dashboard', async (req, res) => {
    const user_id = req.session.user_id;
    if (!user_id) return res.redirect('/login');

    const { data: user } = await supabase.from('users').select('*').eq('id', user_id).single();
    const { data: userCities } = await supabase.from('user_cities').select('*').eq('user_id', user_id);

    res.render('index', { user, userCities: userCities || [] });
});

// --- INVESTMENT LOGIC ---
app.post('/invest', async (req, res) => {
    const { city_name, user_id } = req.body;
    const cityData = CITIES[city_name];
    
    const { data: user } = await supabase.from('users').select('balance').eq('id', user_id).single();
    
    if (!user || user.balance < cityData.cost) {
        return res.json({ success: false, message: "Inadequate balance to join " + city_name });
    }

    // Subtract amount and update database
    const newBalance = user.balance - cityData.cost;
    await supabase.from('users').update({ balance: newBalance }).eq('id', user_id);
    
    await supabase.from('user_cities').insert([{ 
        user_id: parseInt(user_id), 
        city_name: city_name, 
        daily_income: cityData.daily, 
        max_tasks: cityData.tasks 
    }]);

    res.json({ success: true, message: "Joined successfully!" });
});

app.listen(3000, () => console.log("BITREX Server Live"));
