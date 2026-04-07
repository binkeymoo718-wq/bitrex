const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const session = require('express-session');
const helmet = require('helmet');
const cors = require('cors');

// Load environment variables
dotenv.config();

const app = express();

// ================ MIDDLEWARE ================
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'bitrex-secret-key-2026',
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: false, 
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
  }
}));

// ================ VIEW ENGINE ================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ================ STATIC FILES ================
app.use(express.static(path.join(__dirname, 'public')));

// ================ DATABASE CONNECTION ================
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bitrex', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✓ MongoDB connected successfully'))
.catch(err => console.log('✗ MongoDB connection error:', err));

// ================ ROUTES ================
app.use('/auth', require('./routes/auth'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/tasks', require('./routes/tasks'));
app.use('/cities', require('./routes/cities'));
app.use('/wallet', require('./routes/wallet'));
app.use('/referral', require('./routes/referrals'));
app.use('/admin', require('./routes/admin'));

// ================ HOME ROUTE ================
app.get('/', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.render('index', { message: '' });
});

// ================ LOGOUT ROUTE ================
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// ================ 404 HANDLER ================
app.use((req, res) => {
  res.status(404).send('<h1>404 - Page Not Found</h1>');
});

// ================ ERROR HANDLER ================
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('<h1>500 - Server Error</h1><p>' + err.message + '</p>');
});

// ================ START SERVER ================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════════╗`);
  console.log(`║  BITREX SERVER RUNNING ON PORT ${PORT}  ║`);
  console.log(`║  http://localhost:${PORT}           ║`);
  console.log(`╚════════════════════════════════════╝\n`);
});
