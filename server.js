const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

// =======================
// 🔑 SUPABASE CONFIG
// =======================
const supabaseUrl = "https://mpasmnqayaunhxdqlpsp.supabase.co";
const supabaseKey = "YOUR_SUPABASE_ANON_KEY"; // ⚠️ PUT YOUR REAL KEY HERE
const supabase = createClient(supabaseUrl, supabaseKey);

// =======================
// LOGIN ✅ FIXED
// =======================
app.post("/login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("phone", phone)
      .eq("password", password)
      .single();

    if (error || !data) {
      return res.json({ message: "Invalid credentials" });
    }

    // ✅ IMPORTANT FIX (frontend expects this)
    res.json({
      user: data
    });

  } catch (err) {
    res.json({ message: "Server error" });
  }
});

// =======================
// DEPOSIT
// =======================
app.post("/deposit", async (req, res) => {
  try {
    const { userId, amount } = req.body;

    const { data: user } = await supabase
      .from("users")
      .select("balance")
      .eq("id", userId)
      .single();

    const newBalance = user.balance + amount;

    await supabase
      .from("users")
      .update({ balance: newBalance })
      .eq("id", userId);

    const { data: transaction } = await supabase
      .from("transactions")
      .insert([
        {
          userId,
          amount,
          status: "completed",
          type: "deposit"
        }
      ])
      .select();

    res.json({
      message: "Deposit successful",
      newBalance,
      transaction
    });

  } catch (err) {
    res.json({ message: "Deposit failed" });
  }
});

// =======================
// WITHDRAW
// =======================
app.post("/withdraw", async (req, res) => {
  try {
    const { userId, amount } = req.body;

    const { data: user } = await supabase
      .from("users")
      .select("balance")
      .eq("id", userId)
      .single();

    if (!user || user.balance < amount) {
      return res.json({ message: "Insufficient balance" });
    }

    const newBalance = user.balance - amount;

    await supabase
      .from("users")
      .update({ balance: newBalance })
      .eq("id", userId);

    const { data: transaction } = await supabase
      .from("transactions")
      .insert([
        {
          userId,
          amount,
          status: "completed",
          type: "withdraw"
        }
      ])
      .select();

    res.json({
      message: "Withdraw successful",
      newBalance,
      transaction
    });

  } catch (err) {
    res.json({ message: "Withdraw failed" });
  }
});

// =======================
// TRANSACTIONS HISTORY
// =======================
app.get("/transactions/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("userId", userId)
      .order("created_at", { ascending: false });

    if (error) {
      return res.json({ message: "Error fetching transactions" });
    }

    res.json({
      message: "Transaction history",
      data
    });

  } catch (err) {
    res.json({ message: "Server error" });
  }
});

// =======================
// START SERVER
// =======================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
