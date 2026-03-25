const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// Fake database (for now)
let users = [];

// ROOT
app.get("/", (req, res) => {
  res.send("BITREX API is running 🚀");
});

// REGISTER
app.post("/register", (req, res) => {
  const { phone, password } = req.body;

  const user = {
    id: Date.now(),
    phone,
    password,
    balance: 0,
    invested_amount: 0
  };

  users.push(user);
  res.json(user);
});

// LOGIN
app.post("/login", (req, res) => {
  const { phone, password } = req.body;

  const user = users.find(
    (u) => u.phone === phone && u.password === password
  );

  if (!user) return res.status(400).json({ error: "Invalid credentials" });

  res.json(user);
});

// TASK
app.post("/complete-task", (req, res) => {
  const { userId } = req.body;

  const user = users.find((u) => u.id == userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  user.balance += 50;

  res.json({ message: "Task completed", balance: user.balance });
});

// DEPOSIT
app.post("/deposit", (req, res) => {
  const { userId, amount } = req.body;

  const user = users.find((u) => u.id == userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  user.invested_amount += Number(amount);

  res.json({ message: "Deposit submitted" });
});

// ADMIN APPROVE
app.post("/admin/approve-deposit", (req, res) => {
  const { userId, amount } = req.body;

  const user = users.find((u) => u.id == userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  user.balance += Number(amount);

  res.json({ message: "Deposit approved" });
});

// START SERVER
app.listen(process.env.PORT || 3000, () => {
  console.log("BITREX running...");
});
