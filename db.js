const Database = require("better-sqlite3");

const db = new Database("database/event.db");

// Tạo bảng nếu chưa có
db.exec(`
    CREATE TABLE IF NOT EXISTS participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        identity_key TEXT UNIQUE,
        full_name TEXT NOT NULL,
        school TEXT NOT NULL,
        ticket_code TEXT UNIQUE NOT NULL,
        image_path TEXT NOT NULL,
        create_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
`);

const insertParticipant = db.prepare(`
    INSERT INTO participants
    (identity_key, full_name, school, ticket_code, image_path)
    VALUES (?, ?, ?, ?, ?)
`);

function createParticipant(
    identityKey,
    fullName,
    school,
    ticketCode,
    imagePath
) {
    return insertParticipant.run(
        identityKey,
        fullName,
        school,
        ticketCode,
        imagePath
    );
}

module.exports = {
    db,
    createParticipant
};