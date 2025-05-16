import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import connectDB from "./database/db.js";
import User from "./models/user.model.js";
import Note from "./models/note.model.js";
import authenticateToken from "./utilities.js";

dotenv.config();

const app = express();
app.use(express.json());

const allowedOrigins = ["https://notes-frontend-alpha-beryl.vercel.app"];
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// Routes
app.get("/", (req, res) => {
  res.json({ data: "hello" });
});

// Create Account
app.post("/create-account", async (req, res) => {
  const { fullName, email, password } = req.body;

  if (!fullName || !email || !password) {
    return res.status(400).json({ error: true, message: "All fields are required" });
  }

  try {
    const isUser = await User.findOne({ email });
    if (isUser) {
      return res.status(409).json({ error: true, message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({ fullName, email, password: hashedPassword });
    await user.save();

    const accessToken = jwt.sign({ userId: user._id }, process.env.ACCESS_TOKEN_SECRET, {
      expiresIn: "3600m",
    });

    return res.status(201).json({
      error: false,
      message: "Account created successfully",
      accessToken,
    });
  } catch (error) {
    return res.status(500).json({ error: true, message: "Server error" });
  }
});

// Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: true, message: "Email and Password are required." });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: true, message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: true, message: "Invalid credentials" });
    }

    const accessToken = jwt.sign({ userId: user._id }, process.env.ACCESS_TOKEN_SECRET, {
      expiresIn: "3600m",
    });

    return res.json({
      error: false,
      message: "Login successful",
      email,
      accessToken,
    });
  } catch (error) {
    return res.status(500).json({ error: true, message: "Server error" });
  }
});

// Get user
app.get("/get-user", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(401).json({ error: true, message: "Unauthorized" });

    return res.json({
      user: {
        fullName: user.fullName,
        email: user.email,
        _id: user._id,
        createdOn: user.createdOn,
      },
      message: "",
    });
  } catch {
    return res.status(500).json({ error: true, message: "Server error" });
  }
});

// Add Note
app.post("/add-note", authenticateToken, async (req, res) => {
  const { title, content, tags } = req.body;
  const userId = req.user.userId;

  if (!title || !content) {
    return res.status(400).json({ error: true, message: "Title and Content are required" });
  }

  try {
    const note = new Note({ title, content, tags: tags || [], userId });
    await note.save();

    return res.json({ error: false, note, message: "Note added successfully" });
  } catch {
    return res.status(500).json({ error: true, message: "Server error" });
  }
});

// Edit Note
app.put("/edit-note/:noteId", authenticateToken, async (req, res) => {
  const { title, content, tags, isPinned } = req.body;
  const noteId = req.params.noteId;
  const userId = req.user.userId;

  try {
    const note = await Note.findOne({ _id: noteId, userId });
    if (!note) return res.status(404).json({ error: true, message: "Note not found" });

    if (title) note.title = title;
    if (content) note.content = content;
    if (tags) note.tags = tags;
    if (typeof isPinned === "boolean") note.isPinned = isPinned;

    await note.save();

    return res.json({ error: false, note, message: "Note updated successfully" });
  } catch {
    return res.status(500).json({ error: true, message: "Server error" });
  }
});

// Get All Notes
app.get("/get-all-notes", authenticateToken, async (req, res) => {
  try {
    const notes = await Note.find({ userId: req.user.userId }).sort({ isPinned: -1 });
    return res.json({ error: false, notes, message: "All notes retrieved successfully" });
  } catch {
    return res.status(500).json({ error: true, message: "Server error" });
  }
});

// Delete Note
app.delete("/delete-note/:noteId", authenticateToken, async (req, res) => {
  const noteId = req.params.noteId;
  const userId = req.user.userId;

  try {
    const note = await Note.findOne({ _id: noteId, userId });
    if (!note) return res.status(404).json({ error: true, message: "Note not found" });

    await Note.deleteOne({ _id: noteId });
    return res.json({ error: false, message: "Note deleted successfully" });
  } catch {
    return res.status(500).json({ error: true, message: "Server error" });
  }
});

// Update isPinned
app.put("/update-note-pinned/:noteId", authenticateToken, async (req, res) => {
  const noteId = req.params.noteId;
  const { isPinned } = req.body;
  const userId = req.user.userId;

  try {
    const note = await Note.findOne({ _id: noteId, userId });
    if (!note) return res.status(404).json({ error: true, message: "Note not found" });

    note.isPinned = !!isPinned;
    await note.save();

    return res.json({ error: false, note, message: "Pinned status updated" });
  } catch {
    return res.status(500).json({ error: true, message: "Server error" });
  }
});

// Search Notes
app.get("/search-notes", authenticateToken, async (req, res) => {
  const { query } = req.query;
  const userId = req.user.userId;

  if (!query) return res.status(400).json({ error: true, message: "Query is required" });

  try {
    const notes = await Note.find({
      userId,
      $or: [
        { title: { $regex: query, $options: "i" } },
        { content: { $regex: query, $options: "i" } },
      ],
    });

    return res.json({ error: false, notes, message: "Matching notes found" });
  } catch {
    return res.status(500).json({ error: true, message: "Server error" });
  }
});

// Start Server
const PORT = process.env.PORT || 8000;
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
});

export default app;
