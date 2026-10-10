const express = require("express");
const path = require("path");
const fs = require("fs");
const Database = require(
  path.join(__dirname, "..", "node_modules", "better-sqlite3")
);

const app = express();
const PORT = 3001;

const rootDir = path.join(__dirname, "..");
const dbPath = path.join(rootDir, "database", "event.db");
const uploadsDir = path.join(rootDir, "uploads");

const db = new Database(dbPath, {
  readonly: true,
  fileMustExist: true
});

app.use(express.static(__dirname));

app.use(
  "/shared-assets",
  express.static(path.join(rootDir, "frontend", "assets"))
);

app.get("/api/participants", (req, res) => {
  try {
    const participants = db.prepare(`
      SELECT id, full_name, school, image_path
      FROM participants
      WHERE status = 1
      ORDER BY id ASC
    `).all();

    res.json({
      total: participants.length,
      participants: participants.map(person => ({
        id: person.id,
        full_name: person.full_name,
        school: person.school,
        image_url: `/images/${encodeURIComponent(
          path.basename(person.image_path)
        )}`
      }))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Không thể đọc database." });
  }
});

app.get("/images/:filename", (req, res) => {
  const filename = path.basename(req.params.filename);
  const imagePath = path.join(uploadsDir, filename);

  if (!fs.existsSync(imagePath)) {
    return res.sendStatus(404);
  }

  res.sendFile(imagePath);
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Raffle: http://127.0.0.1:${PORT}`);
  console.log(`Database: ${dbPath}`);
});