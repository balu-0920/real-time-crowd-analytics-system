const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const User = require("./models/User");

mongoose.connect("mongodb://127.0.0.1:27017/crowd");

async function seed() {

  await User.deleteMany();

  const users = [
    {
      username: "balu",
      password: await bcrypt.hash("balu123", 10),
      role: "control"
    },
    {
      username: "security",
      password: await bcrypt.hash("security123", 10),
      role: "security"
    }
  ];

  await User.insertMany(users);

  console.log("Users created successfully");
  process.exit();
}

seed();
