
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const userRoutes = require("./routes/userRoutes");
const assignmentRoutes = require("./routes/assignmentRoutes");
const programRoutes = require("./routes/programRoutes");
const pendingUserRoutes = require("./routes/pendingUserRoutes");
const adminLogRoutes = require("./routes/adminLogRoutes");
const currentUserRoutes = require("./routes/currentUserRoutes");

app.use("/api/users", userRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/programs", programRoutes);
app.use("/api/pending-users", pendingUserRoutes);
app.use("/api/admin-logs", adminLogRoutes);
app.use("/api/current-user", currentUserRoutes);

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log(err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
app.get('/', (req, res) => {
res.send('Backend API is running...');
});