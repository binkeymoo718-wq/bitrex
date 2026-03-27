const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Supabase config
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ✅ Test route
app.get("/", (req, res) => {
  res.send("BITREX API is running 🚀");
});


// =============================
// ✅ LOGIN
// =============================
app.post("/login", async (req, res) => {
  const { phone, password } = req.body;

  try {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("phone", phone)
      .eq("password", password)
      .single();

    if (error || !data) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// =============================
// ✅ DEPOSIT
// =============================
app.post("/deposit", async (req, res) => {
  const { userId, amount } = req.body;

  try {
    // 1. Get user
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (userError) throw userError;

    // 2. Update balance
    const newBalance = user.balance + amount;

    const { error: updateError } = await supabase
      .from("users")
      .update({ balance: newBalance })
      .eq("id", userId);

    if (updateError) throw updateError;

    // 3. Insert transaction (RETURN DATA ✅)
    const { data: transaction, error: txError } = await supabase
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

    if (txError) throw txError;

    res.json({
      message: "Deposit successful",
      newBalance,
      transaction,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// =============================
// ✅ WITHDRAW
// =============================
app.post("/withdraw", async (req, res) => {
  const { userId, amount } = req.body;

  try {
    // 1. Get user
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (userError) throw userError;

    // 2. Check balance
    if (user.balance < amount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    // 3. Update balance
    const newBalance = user.balance - amount;

    const { error: updateError } = await supabase
      .from("users")
      .update({ balance: newBalance })
      .eq("id", userId);

    if (updateError) throw updateError;

    // 4. Insert transaction (RETURN DATA ✅)
    const { data: transaction, error: txError } = await supabase
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

    if (txError) throw txError;

    res.json({
      message: "Withdraw successful",
      newBalance,
      transaction,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// =============================
// ✅ TRANSACTION HISTORY
// =============================
app.get("/transactions/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("userId", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({
      message: "Transaction history",
      data,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// =============================
// ✅ START SERVER
// =============================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
