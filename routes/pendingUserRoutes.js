
const express = require("express");
const router = express.Router();
const PendingUser = require("../models/PendingUser");

router.get("/", async (req, res) => {
  const pendingUsers = await PendingUser.find();
  res.json(pendingUsers);
});

router.post("/", async (req, res) => {
  try {
    const newPendingUser = new PendingUser(req.body);
    await newPendingUser.save();
    res.status(201).json(newPendingUser); // Send back created user
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
