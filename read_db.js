const Database = require("better-sqlite3");

const db = new Database("./database/event.db");

const rows = db.prepare("SELECT * FROM participants").all();

console.table(rows);

db.close();