
const express = require("express");
const router = express.Router();
const User = require("../models/User");

router.get("/", async (req, res) => {
  const users = await User.find();
  res.json(users);
});

router.post("/", async (req, res) => {
  try {
    await User.deleteMany({});
    await User.insertMany(req.body);
    res.json({ message: "Users saved successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: new RegExp(`^${email}$`, 'i') });
  if (!user) return res.status(404).json({ error: "Email not found" });
  if (user.password !== password) return res.status(401).json({ error: "Invalid password" });
  res.json({ user });
});

module.exports = router;
