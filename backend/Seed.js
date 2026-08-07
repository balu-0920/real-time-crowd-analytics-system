require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const User = require("./models/User");

mongoose.connect(process.env.MONGO_URI);

async function seed() {
  await User.deleteMany({});

  const users = [
    {
      username: "balu_control",
      password: await bcrypt.hash("605124", 10),
      role: "control"
    },
    {
      username: "balu_security",
      password: await bcrypt.hash("605124", 10),
      role: "security"
    }
  ];

  await User.insertMany(users);

  console.log("Done");
  process.exit();
}

seed();
