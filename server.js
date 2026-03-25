const express = require("express");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// ====== FAKE DATABASE (temporary) ======
let users = [];
let transactions = [];

// ====== HOME ROUTE ======
app.get("/", (req, res) => {
  res.send("BITREX API is running 🚀");
});

// ====== SIGNUP ======
app.post("/signup", (req, res) => {
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

// ====== LOGIN ======
app.post("/login", (req, res) => {
  const { phone, password } = req.body;

  const user = users.find(
    u => u.phone === phone && u.password === password
  );

  if (!user) return res.status(400).json({ error: "Invalid login" });

  res.json(user);
});

// ====== COMPLETE TASK ======
app.post("/complete-task", (req, res) => {
  const { userId } = req.body;

  const user = users.find(u => u.id == userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  user.balance += 50;

  res.json({ message: "Task completed", balance: user.balance });
});

// ====== DEPOSIT ======
app.post("/deposit", (req, res) => {
  const { userId, amount } = req.body;

  transactions.push({
    id: Date.now(),
    userId,
    amount,
    status: "pending"
  });

  res.json({ message: "Deposit submitted" });
});

// ====== ADMIN APPROVE DEPOSIT ======
app.post("/admin/approve-deposit", (req, res) => {
  const { id, userId, amount } = req.body;

  const transaction = transactions.find(t => t.id == id);
  if (!transaction) return res.status(404).json({ error: "Transaction not found" });

  transaction.status = "approved";

  const user = users.find(u => u.id == userId);
  if (user) {
    user.balance += Number(amount);
  }

  res.json({ message: "Deposit approved" });
});

// ====== START SERVER ======
app.listen(process.env.PORT || 3000, () => {
  console.log("BITREX running 🚀");
});
