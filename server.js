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

// ✅ TEST ROUTE
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
// 💰 DEPOSIT ROUTE
// =======================
app.post("/deposit", async (req, res) => {
  const { userId, amount } = req.body;

  try {
    // 1. Insert into transactions
    const { data, error } = await supabase
      .from("transactions")
      .insert([
        {
          userId,
          amount,
          status: "pending",
        },
      ])
      .select(); // ✅ FIX FOR NULL ISSUE

    if (error) {
      return res.status(400).json({
        error: error.message,
      });
    }

    res.json({
      message: "Deposit request created",
      data: data, // ✅ now returns inserted row
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});


// =======================
// 📜 GET TRANSACTIONS
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
