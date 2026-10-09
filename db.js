const Database = require("better-sqlite3");
const fs = require("fs");

if (!fs.existsSync("database")) {
    fs.mkdirSync("database");
}

const db = new Database("database/event.db");

// Bật WAL mode để xử lý concurrent requests (chống burst tốt hơn cho SQLite)
db.pragma('journal_mode = WAL');

// Tạo bảng (Thêm trường status: 0 = pending, 1 = confirmed)
// Sử dụng id làm ticket_code (dạng số nguyên tăng dần)
db.exec(`
    CREATE TABLE IF NOT EXISTS participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        identity_key TEXT UNIQUE,
        full_name TEXT NOT NULL,
        school TEXT NOT NULL,
        image_path TEXT NOT NULL,
        status INTEGER DEFAULT 0,
        create_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
`);

const insertParticipant = db.prepare(`
    INSERT INTO participants
    (identity_key, full_name, school, image_path)
    VALUES (?, ?, ?, ?)
`);

const updateParticipantInfo = db.prepare(`
    UPDATE participants
    SET full_name = ?, school = ?, image_path = ?, status = 0
    WHERE identity_key = ?
`);

const confirmTicket = db.prepare(`
    UPDATE participants
    SET status = 1
    WHERE identity_key = ?
`);

const getParticipant = db.prepare(`
    SELECT * FROM participants WHERE identity_key = ?
`);

function saveOrUpdateParticipant(identityKey, fullName, school, imagePath) {
    let oldImagePath = null;
    let ticketId;

    // Sử dụng transaction để đảm bảo toàn vẹn dữ liệu
    const runTx = db.transaction(() => {
        const existing = getParticipant.get(identityKey);
        
        if (existing) {
            if (existing.status === 1) {
                // Đã nhận ticket thành công trước đó, không được chơi lại
                throw new Error("ALREADY_CONFIRMED");
            }
            // Đang pending (lần trước bị lỗi mạng thoát giữa chừng chưa kịp nhận ticket)
            // Ghi đè thông tin mới
            oldImagePath = existing.image_path;
            updateParticipantInfo.run(fullName, school, imagePath, identityKey);
            ticketId = existing.id; // giữ nguyên số báo danh cũ
        } else {
            // Chưa có, insert mới
            const info = insertParticipant.run(identityKey, fullName, school, imagePath);
            ticketId = info.lastInsertRowid;
        }
    });
    
    runTx();

    // Dọn dẹp ảnh cũ nếu có ghi đè (thực hiện ngoài transaction để tránh lock DB)
    if (oldImagePath && oldImagePath !== imagePath && fs.existsSync(oldImagePath)) {
        try { fs.unlinkSync(oldImagePath); } catch(e) {}
    }

    return ticketId;
}

function markAsConfirmed(identityKey) {
    confirmTicket.run(identityKey);
}

module.exports = {
    db,
    saveOrUpdateParticipant,
    markAsConfirmed,
    getParticipant
};