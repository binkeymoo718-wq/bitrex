const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const DailyIncome = require('../models/DailyIncome');

const TASKS = [
  { name: '2.5L Vacuum Flask', amount: 50 },
  { name: 'Mini Massage Gun', amount: 50 },
  { name: 'Blood Glucose Machine', amount: 50 },
  { name: 'Electric Blender', amount: 50 },
  { name: 'Modern Soldering Gun', amount: 50 },
  { name: 'Television Set', amount: 50 },
  { name: 'Electric Meter', amount: 50 },
  { name: 'Smart Phones', amount: 50 },
  { name: 'HD Camera High Pixel', amount: 50 },
  { name: 'Iron Sheets', amount: 50 },
  { name: 'Plumbing Tools', amount: 50 },
  { name: 'Furniture', amount: 50 },
  { name: 'Wi-Fi Systems', amount: 50 },
  { name: 'Laptops', amount: 50 },
  { name: 'Textiles', amount: 50 },
  { name: 'Paints', amount: 50 },
  { name: 'Cosmetics', amount: 50 },
  { name: 'Electrical Tools', amount: 50 },
  { name: 'Shoes', amount: 50 },
  { name: 'Gas Cookers', amount: 50 },
  { name: 'Electric Heater', amount: 50 },
  { name: 'Air Fryer (4L or 5L)', amount: 50 },
  { name: 'Electric Pressure Cooker', amount: 50 },
  { name: 'Microwave Oven', amount: 50 },
  { name: 'Non-stick Cookware Set', amount: 50 },
  { name: 'Water Dispenser (Hot & Cold)', amount: 50 },
  { name: 'Rechargeable Juicer Cup', amount: 50 },
  { name: 'Electric Kettle (Stainless Steel)', amount: 50 },
  { name: 'Subwoofer System (Bluetooth)', amount: 50 },
  { name: 'Android TV Box', amount: 50 },
  { name: 'Rechargeable Bluetooth Speaker', amount: 50 },
  { name: 'Gaming Console (Handheld)', amount: 50 },
  { name: 'Smart Watch (Series 8/9)', amount: 50 },
  { name: 'Wireless Earbuds (Airpods Pro)', amount: 50 },
  { name: 'Solar Lighting System', amount: 50 }
];

const CITIES = {
  'CITY A': { investment: 1500, maxTasks: 1, dailyIncome: 50 },
  'CITY B': { investment: 3200, maxTasks: 2, dailyIncome: 100 },
  'CITY C': { investment: 7200, maxTasks: 4, dailyIncome: 200 },
  'CITY D': { investment: 12000, maxTasks: 8, dailyIncome: 400 },
  'CITY E': { investment: 15000, maxTasks: 10, dailyIncome: 500 }
};

const checkAuth = (req, res, next) => {
  if (!req.session.userId) return res.redirect('/');
  next();
};

router.get('/', checkAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user.investedCities.length) {
      return res.status(400).render('tasks', { message: 'Invest in a city first', tasks: [], maxTasks: 0, canDoMoreTasks: false });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (user.lastTaskDate && user.lastTaskDate < today) {
      user.tasksCompletedToday = 0;
      await user.save();
    }

    const maxTasks = user.investedCities.reduce((total, city) => total + CITIES[city.city].maxTasks, 0);

    res.render('tasks', {
      user,
      tasks: TASKS,
      maxTasks,
      tasksCompletedToday: user.tasksCompletedToday,
      canDoMoreTasks: user.tasksCompletedToday < maxTasks,
      message: ''
    });
  } catch (error) {
    console.error(error);
    res.redirect('/dashboard');
  }
});

router.post('/complete', checkAuth, async (req, res) => {
  try {
    const { taskName } = req.body;
    const user = await User.findById(req.session.userId);

    if (!user.investedCities.length) {
      return res.json({ success: false, message: 'Invest in a city first' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setHours(-1);

    if (user.lastTaskDate && user.lastTaskDate < yesterday) {
      user.tasksCompletedToday = 0;
    }

    const maxTasks = user.investedCities.reduce((total, city) => total + CITIES[city.city].maxTasks, 0);

    if (user.tasksCompletedToday >= maxTasks) {
      return res.json({ success: false, message: 'Number of task limit reached' });
    }

    const task = TASKS.find(t => t.name === taskName);
    if (!task) {
      return res.json({ success: false, message: 'Task not found' });
    }

    user.balance += task.amount;
    user.totalEarnings += task.amount;
    user.tasksCompletedToday += 1;
    user.lastTaskDate = new Date();

    let dailyIncome = await DailyIncome.findOne({ userId: user._id, date: { $gte: today } });
    if (!dailyIncome) {
      dailyIncome = new DailyIncome({
        userId: user._id,
        date: today,
        taskIncome: task.amount,
        totalIncome: task.amount
      });
    } else {
      dailyIncome.taskIncome += task.amount;
      dailyIncome.totalIncome += task.amount;
    }

    dailyIncome.tasksCompleted.push({
      taskName: task.name,
      amount: task.amount,
      completedAt: new Date()
    });

    await Transaction.create({
      userId: user._id,
      type: 'task_income',
      amount: task.amount,
      status: 'completed',
      description: `Task: ${task.name}`
    });

    await user.save();
    await dailyIncome.save();

    res.json({
      success: true,
      message: 'Task completed!',
      balance: user.balance,
      todayIncome: dailyIncome.totalIncome,
      tasksRemaining: maxTasks - user.tasksCompletedToday
    });
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
