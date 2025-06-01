
const express = require("express");
const router = express.Router();
const CurrentUser = require("../models/CurrentUser");

router.get("/", async (req, res) => {
  const users = await CurrentUser.find();
  res.json(users);
});

router.post("/", async (req, res) => {
  try {
    await CurrentUser.deleteMany({});
    await CurrentUser.insertMany(req.body);
    res.json({ message: "Current user saved successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
