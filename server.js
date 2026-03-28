const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

/* ================== SUPABASE ================== */
const supabase = createClient(
  "https://mpasmnqayaunhxdqlpsp.supabase.co",
  ""sb_publishable_T7Yk4Z3zxOjLh-wFMJfAtw_76iXk_qY
);

/* ================== LOGIN ================== */
app.post("/login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ message: "Missing phone or password" });
    }

    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("phone", phone.trim())
      .single();

    if (error || !data) {
      return res.status(400).json({ message: "User not found" });
    }

    if (data.password !== password) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    res.json({
      id: data.id,
      phone: data.phone,
      balance: data.balance
    });

  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/* ================== DEPOSIT ================== */
app.post("/deposit", async (req, res) => {
  try {
    const { phone, amount } = req.body;

    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("phone", phone.trim())
      .single();

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    const newBalance = user.balance + Number(amount);

    await supabase
      .from("users")
      .update({ balance: newBalance })
      .eq("phone", phone.trim());

    res.json({ balance: newBalance });

  } catch {
    res.status(500).json({ message: "Deposit error" });
  }
});

/* ================== WITHDRAW ================== */
app.post("/withdraw", async (req, res) => {
  try {
    const { phone, amount } = req.body;

    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("phone", phone.trim())
      .single();

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    if (user.balance < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    const newBalance = user.balance - Number(amount);

    await supabase
      .from("users")
      .update({ balance: newBalance })
      .eq("phone", phone.trim());

    res.json({ balance: newBalance });

  } catch {
    res.status(500).json({ message: "Withdraw error" });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server running...");
});
