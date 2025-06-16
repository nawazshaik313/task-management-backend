
const express = "express";
const router = express.Router();
// const CurrentUser = require("../models/CurrentUser"); // Model might be unused if GET /users/current is sufficient

// This route is largely superseded by GET /users/current from userRoutes.js
// If CurrentUser model and this specific route for GET are still needed, keep it.
// Otherwise, consider removing this route and CurrentUser.js model.
router.get("/", async (req, res) => {
  // Assuming CurrentUser model is a simplified store for *the* current user, which is unusual.
  // For a typical app, GET /users/current (from userRoutes) is the standard way.
  // This route might need to be re-evaluated based on its specific purpose.
  // For now, let's assume it attempts to fetch data from a 'currentusers' collection.
  try {
    // const users = await CurrentUser.find(); // If CurrentUser model is used
    // res.json(users);
    res.status(501).json({ message: "GET /current-user is under review. Use GET /users/current for logged-in user data." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// The POST route that overwrites all current users is problematic and generally not a standard API practice.
// It has been removed. If data persistence for 'current user' state is needed beyond client-side JWT,
// it should be handled differently (e.g., session management or specific user profile updates).

module.exports = router;