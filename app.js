require("dotenv").config();
const express = require("express");
const app = express();
const axios = require("axios");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const path = require("path");
const ejsMate = require("ejs-mate");

const Report = require("./Model/Report");
const User = require("./Model/user");
const { ensureAuth, ensureGuest } = require("./middleware/auth");


// ---------- DB ----------
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log(err));


// ---------- Session ----------
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
  })
);


// ---------- Middleware ----------
app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// pass user to all EJS files
app.use((req, res, next) => {
  res.locals.currentUser = req.session.userName || null;
  next();
});


// ---------- ROUTES ----------

// ✅ Landing Page (Public)
app.get("/", (req, res) => {
  res.render("landing");
});

// ✅ Signup Page
app.get("/signup", ensureGuest, (req, res) => {
  res.render("auth/signup", { error: null });
});


app.post("/signup", ensureGuest, async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const exists = await User.findOne({ email });
    if (exists) return res.render("auth/signup", { error: "Email already used." });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash });

    req.session.userId = user._id;
    req.session.userName = user.name;

    res.redirect("/dashboard");
  } catch {
    res.render("auth/signup", { error: "Signup failed." });
  }
});

// ✅ Login Page
app.get("/login", ensureGuest, (req, res) => {
  res.render("auth/login", { error: null });
});


app.post("/login", ensureGuest, async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) return res.render("auth/login", { error: "Invalid credentials." });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.render("auth/login", { error: "Invalid credentials." });

  req.session.userId = user._id;
  req.session.userName = user.name;

  res.redirect("/dashboard");
});

// ✅ Logout
app.get("/logout", ensureAuth, (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

// ✅ Dashboard
app.get("/dashboard", ensureAuth, async (req, res) => {
  const reports = await Report.find({ user: req.session.userId }).sort({ createdAt: -1 });
  res.render("dashboard", { reports });
});


// --------------------
// ✅ Expert + Basic REMAIN SAME
// --------------------

const FLASK_URL = process.env.FLASK_URL;
const API_KEY = process.env.OPENWEATHER_KEY;

// ✅ Expert Form Page
app.get("/expert", ensureAuth, (req, res) => {
  res.render("other/expert");
});

// ✅ Basic Form Page
app.get("/basic", ensureAuth, (req, res) => {
  res.render("other/basic");
});

// ✅ Expert Prediction
app.post("/expert", ensureAuth, async (req, res) => {
  try {
    const body = req.body;
    const flaskRes = await axios.post(`${FLASK_URL}/predict-expert`, body);
    const { prediction, confidence, message } = flaskRes.data;

    // save report
    await Report.create({
      user: req.session.userId,
      city: body.city,
      mode: "expert",
      input: body,
      output: { prediction, confidence, message }
    });

    res.render("result", {
      mode: "expert",
      ...body,
      prediction,
      confidence,
      message,
      weather: { temp: 28, humidity: 50, description: "Auto" }
    });

  } catch (err) {
    console.log(err);
    res.send("Expert mode error.");
  }
});

// ✅ Basic Prediction
app.post("/basic", ensureAuth, async (req, res) => {
  try {
    const body = req.body;
    const flaskRes = await axios.post(`${FLASK_URL}/predict-basic`, body);
    const { prediction, confidence, message } = flaskRes.data;

    await Report.create({
      user: req.session.userId,
      city: body.district,
      mode: "basic",
      input: body,
      output: { prediction, confidence, message }
    });

    res.render("result", {
      mode: "basic",
      ...body,
      prediction,
      confidence,
      message,
      weather: { temp: 30, humidity: 40, description: "Auto" },
      ph: 7,
      nitrogen: 50,
      phosphorus: 30,
      potassium: 20
    });

  } catch (err) {
    console.log(err);
    res.send("Basic mode error.");
  }
});


app.listen(process.env.PORT, () => {
  console.log(`✅ Server running on port ${process.env.PORT}`);
});
