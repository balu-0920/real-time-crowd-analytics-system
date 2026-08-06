require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const User = require("./models/User");

mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/crowd");

async function seed() {

  await User.deleteMany();

  const users = [
    {
      username: "balu_control",
      password: await bcrypt.hash("605124", 10),
      role: "control"
    },
    {
      username: "balu_security",              // TODO: replace with the security person's username
      password: await bcrypt.hash("605124", 10), // TODO: replace with their real password
      role: "security"
    }
  ];

  await User.insertMany(users);

  console.log("Users created successfully");
  process.exit();
}

seed();
