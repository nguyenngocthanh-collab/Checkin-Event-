const db = require("./db");

const schema = db.db
    .prepare(`
        PRAGMA table_info(participants)
    `)
    .all();

console.table(schema);

const count = db.db
    .prepare(`
        SELECT COUNT(*) AS total
        FROM participants
    `)
    .get();

console.log("TOTAL:", count.total);