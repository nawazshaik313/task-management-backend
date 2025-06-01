
const express = require("express");
const router = express.Router();
const Program = require("../models/Program");

router.get("/", async (req, res) => {
  const programs = await Program.find();
  res.json(programs);
});

router.post("/", async (req, res) => {
  try {
    await Program.deleteMany({});
    await Program.insertMany(req.body);
    res.json({ message: "Programs saved successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
