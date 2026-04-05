const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const session = require('express-session');
const bcrypt = require('bcrypt');
require('dotenv').config();

const app = express();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'bitrex_secure_final',
  resave: false,
  saveUninitialized: false
}));

const CITIES = {
  'CITY A': { cost: 1500, daily: 50, tasks: 1 },
  'CITY B': { cost: 3200, daily: 100, tasks: 2 },
  'CITY C': { cost: 7200, daily: 200, tasks: 4 },
  'CITY D': { cost: 12000, daily: 400, tasks: 8 },
  'CITY E': { cost: 15000, daily: 500, tasks: 10 }
};

function auth(req, res, next) {
  if (!req.session.user_id) return res.redirect('/login');
  next();
}

// ROUTES
app.get('/', (req, res) => res.redirect('/login'));

app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// LOGIN
app.post('/login', async (req, res) => {
  const { phone, password } = req.body;

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('phone', phone)
    .single();

  if (!user) return res.render('login', { error: 'User not found' });

  let isMatch = false;

  if (user.password && user.password.startsWith('$2b$')) {
    isMatch = await bcrypt.compare(password, user.password);
  } else {
    isMatch = password === user.password;

    if (isMatch) {
      const hashed = await bcrypt.hash(password, 10);
      await supabase.from('users')
        .update({ password: hashed })
        .eq('id', user.id);
    }
  }

  if (!isMatch) return res.render('login', { error: 'Wrong password' });

  req.session.user_id = user.id;
  res.redirect('/dashboard');
});

// REGISTER
app.get('/register', (req, res) => res.render('register'));

app.post('/register', async (req, res) => {
  const { phone, password } = req.body;

  const hashed = await bcrypt.hash(password, 10);

  await supabase.from('users').insert([{
    phone,
    password: hashed,
    balance: 0,
    todays_income: 0,
    monthly_income: 0,
    total_income: 0
  }]);

  res.redirect('/login');
});

// DASHBOARD
app.get('/dashboard', auth, async (req, res) => {
  try {
    const user_id = req.session.user_id;

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', user_id)
      .single();

    if (!user) return res.send("User not found");

    // prevent null crash
    user.balance = user.balance || 0;
    user.todays_income = user.todays_income || 0;
    user.monthly_income = user.monthly_income || 0;
    user.total_income = user.total_income || 0;

    const { data: userCities } = await supabase
      .from('user_cities')
      .select('*')
      .eq('user_id', user_id);

    res.render('index', {
      user,
      userCities: userCities || []
    });

  } catch (err) {
    console.log(err);
    res.send("Dashboard error");
  }
});

// INVEST
app.post('/invest', auth, async (req, res) => {
  const user_id = req.session.user_id;
  const { city_name } = req.body;

  const city = CITIES[city_name];
  const { data: user } = await supabase.from('users').select('*').eq('id', user_id).single();

  if (!user || user.balance < city.cost) {
    return res.json({ success: false, message: 'Insufficient balance' });
  }

  await supabase.from('users')
    .update({ balance: user.balance - city.cost })
    .eq('id', user_id);

  await supabase.from('user_cities').insert([{
    user_id,
    city_name,
    daily_income: city.daily,
    max_tasks: city.tasks,
    tasks_done: 0
  }]);

  res.json({ success: true, message: 'Joined successfully' });
});

// TASK
app.post('/claim_task', auth, async (req, res) => {
  const user_id = req.session.user_id;

  const { data: cities } = await supabase.from('user_cities').select('*').eq('user_id', user_id);

  let total = 0;
  let done = 0;

  (cities || []).forEach(c => {
    total += c.max_tasks || 0;
    done += c.tasks_done || 0;
  });

  if (done >= total) {
    return res.json({ success: false, message: 'Daily limit reached' });
  }

  const reward = 50;

  const { data: user } = await supabase.from('users').select('*').eq('id', user_id).single();

  await supabase.from('users').update({
    balance: (user.balance || 0) + reward,
    todays_income: (user.todays_income || 0) + reward,
    total_income: (user.total_income || 0) + reward
  }).eq('id', user_id);

  await supabase.from('user_cities')
    .update({ tasks_done: done + 1 })
    .eq('user_id', user_id);

  res.json({ success: true, message: 'Task completed +50 Ksh' });
});

// WITHDRAW
app.post('/withdraw', auth, async (req, res) => {
  const user_id = req.session.user_id;
  const { amount } = req.body;

  const { data: user } = await supabase.from('users').select('*').eq('id', user_id).single();

  if (!user || user.balance < amount) {
    return res.json({ success: false, message: 'Insufficient balance' });
  }

  await supabase.from('users')
    .update({ balance: user.balance - amount })
    .eq('id', user_id);

  await supabase.from('transactions').insert([{
    user_id,
    amount,
    type: 'withdrawal',
    status: 'pending'
  }]);

  res.json({ success: true, message: 'Withdrawal submitted' });
});

// DEPOSIT
app.post('/deposit', auth, async (req, res) => {
  const user_id = req.session.user_id;
  const { amount, code } = req.body;

  await supabase.from('transactions').insert([{
    user_id,
    amount,
    type: 'deposit',
    status: 'pending',
    reference: code
  }]);

  res.json({ success: true, message: 'Deposit submitted' });
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

app.listen(3000, () => console.log('Server running on port 3000'));
