
const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DATABASE_DIR = path.join(ROOT, "database");

fs.mkdirSync(DATABASE_DIR, { recursive: true });

const db = new Database(path.join(DATABASE_DIR, "event.db"));

db.pragma("journal_mode = WAL");
db.pragma("synchronous = FULL");
db.pragma("busy_timeout = 10000");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identity_key TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    school TEXT NOT NULL,
    image_path TEXT NOT NULL,
    status INTEGER NOT NULL DEFAULT 0,
    create_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

// Bổ sung cột cho database cũ mà không xóa dữ liệu.
const columns = db.prepare(
  "PRAGMA table_info(participants)"
).all();

if (!columns.some(column => column.name === "submission_id")) {
  db.exec(
    "ALTER TABLE participants ADD COLUMN submission_id TEXT"
  );
}

// Một submission_id chỉ thuộc về một người tham gia.
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS
  idx_participants_submission_id
  ON participants(submission_id)
  WHERE submission_id IS NOT NULL;
`);

const getByIdentity = db.prepare(`
  SELECT * FROM participants
  WHERE identity_key = ?
`);

const getBySubmission = db.prepare(`
  SELECT * FROM participants
  WHERE submission_id = ?
`);

const insertParticipant = db.prepare(`
  INSERT INTO participants (
    identity_key,
    submission_id,
    full_name,
    school,
    image_path,
    status
  )
  VALUES (
    @identity_key,
    @submission_id,
    @full_name,
    @school,
    @image_path,
    0
  )
`);

const getById = db.prepare(`
  SELECT * FROM participants WHERE id = ?
`);

const confirmParticipant = db.prepare(`
  UPDATE participants
  SET status = 1
  WHERE identity_key = ?
`);

const saveOrGetTransaction = db.transaction((input) => {
  // Cùng submission_id: đây là request được gửi lại.
  let existing = getBySubmission.get(input.submissionId);

  if (existing) {
    return {
      participant: existing,
      useUploadedImage: false,
      duplicate: true
    };
  }

  // Cùng identity_key: không tạo vé mới.
  existing = getByIdentity.get(input.identityKey);

  if (existing) {
    return {
      participant: existing,
      useUploadedImage: false,
      duplicate: true
    };
  }

  const insert = insertParticipant.run({
    identity_key: input.identityKey,
    submission_id: input.submissionId,
    full_name: input.fullName,
    school: input.school,
    image_path: input.imagePath
  });

  return {
    participant: getById.get(insert.lastInsertRowid),
    useUploadedImage: true,
    duplicate: false
  };
});

function saveOrGetParticipant(input) {
  return saveOrGetTransaction(input);
}

function markAsConfirmed(identityKey) {
  const result = confirmParticipant.run(identityKey);

  // SQLite changes = 0 nếu không có bản ghi phù hợp.
  // Nếu bản ghi đã status=1, gọi lại vẫn cần được xem là thành công.
  if (result.changes > 0) return true;

  const existing = getByIdentity.get(identityKey);
  return Boolean(existing && existing.status === 1);
}

function getParticipant(identityKey) {
  return getByIdentity.get(identityKey);
}

function getParticipantBySubmission(submissionId) {
  return getBySubmission.get(submissionId);
}

module.exports = {
  db,
  saveOrGetParticipant,
  markAsConfirmed,
  getParticipant,
  getParticipantBySubmission
};
