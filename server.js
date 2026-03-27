const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

// Supabase config
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// TEST ROUTE
app.get("/", (req, res) => {
  res.send("BITREX API is running 🚀");
});

// ====================== LOGIN ======================
app.post("/login", async (req, res) => {
  const { phone, password } = req.body;

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("phone", phone)
    .eq("password", password)
    .single();

  if (error) {
    return res.status(400).json({ error: "Invalid credentials" });
  }

  res.json(data);
});

// ====================== DEPOSIT ======================
app.post("/deposit", async (req, res) => {
  try {
    const { userId, amount } = req.body;

    // Get user
    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    const newBalance = user.balance + amount;

    // Update balance
    await supabase
      .from("users")
      .update({ balance: newBalance })
      .eq("id", userId);

    // Insert transaction
    const { data: transaction } = await supabase
      .from("transactions")
      .insert([
        {
          userId,
          amount,
          type: "deposit",
          status: "completed",
        },
      ])
      .select();

    res.json({
      message: "Deposit successful",
      newBalance,
      transaction,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ====================== WITHDRAW ======================
app.post("/withdraw", async (req, res) => {
  try {
    const { userId, amount } = req.body;

    // Get user
    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    // Check balance
    if (user.balance < amount) {
      return res.status(400).json({
        error: "Insufficient balance",
      });
    }

    const newBalance = user.balance - amount;

    // Update balance
    await supabase
      .from("users")
      .update({ balance: newBalance })
      .eq("id", userId);

    // Insert transaction
    const { data: transaction } = await supabase
      .from("transactions")
      .insert([
        {
          userId,
          amount,
          type: "withdraw",
          status: "completed",
        },
      ])
      .select();

    res.json({
      message: "Withdraw successful",
      newBalance,
      transaction,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ====================== TRANSACTION HISTORY ======================
app.get("/transactions/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;

    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("userId", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ====================== START SERVER ======================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
