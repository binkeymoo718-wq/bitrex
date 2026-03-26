const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

// 🔑 Supabase config
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// =======================
// ✅ TEST ROUTE
// =======================
app.get("/", (req, res) => {
  res.send("BITREX API is running 🚀");
});


// =======================
// 🔐 LOGIN ROUTE
// =======================
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
      return res.status(400).json({
        error: "Invalid phone or password",
      });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});


// =======================
// 💰 DEPOSIT ROUTE (UPDATED)
// =======================
app.post("/deposit", async (req, res) => {
  const { userId, amount } = req.body;

  try {
    // 1. Get user
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return res.status(400).json({
        error: "User not found",
      });
    }

    // 2. Calculate new balance
    const newBalance = user.balance + amount;

    // 3. Update balance
    const { error: updateError } = await supabase
      .from("users")
      .update({ balance: newBalance })
      .eq("id", userId);

    if (updateError) {
      return res.status(400).json({
        error: updateError.message,
      });
    }

    // 4. Save transaction
    const { data, error } = await supabase
      .from("transactions")
      .insert([
        {
          userId,
          amount,
          status: "completed",
        },
      ])
      .select();

    if (error) {
      return res.status(400).json({
        error: error.message,
      });
    }

    res.json({
      message: "Deposit successful",
      newBalance: newBalance,
      transaction: data,
    });

  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});


// =======================
// 📜 GET USER TRANSACTIONS
// =======================
app.get("/transactions/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("userId", userId);

    if (error) {
      return res.status(400).json({
        error: error.message,
      });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});


// =======================
// 🚀 START SERVER
// =======================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
