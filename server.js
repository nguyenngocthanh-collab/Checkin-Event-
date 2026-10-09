const express = require("express");
const crypto = require("crypto");
const multer = require("multer");
const errorHandler = require("./errorHandler");
const fs = require("fs");
const db = require("./db");

// Đảm bảo thư mục uploads tồn tại
if (!fs.existsSync("uploads")) {
    fs.mkdirSync("uploads");
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/"); 
    },
    filename: (req, file, cb) => {
        const name = crypto.randomUUID() + ".jpg"; // Ảnh đã được nén thành jpg từ client
        cb(null, name); 
    }
});

const app = express();
const upload = multer({ storage });

app.use(express.json());
app.use(express.static("frontend"));

app.get('/', (req, res) => {
    res.send("The server is running");
});

// Endpoint kiểm tra trạng thái ticket của thiết bị khi tải lại trang
app.get("/api/status", (req, res) => {
    const identityKey = req.query.identity_key;
    if (!identityKey) return res.json({ exists: false });
    
    const participant = db.getParticipant.get(identityKey);
    if (participant) {
        return res.json({
            exists: true,
            status: participant.status,
            ticket_code: participant.id
        });
    }
    return res.json({ exists: false });
});

// Endpoint submit data chính
app.post(
    "/api/submit",
    upload.fields([
        { name: "avt", maxCount: 1 },
        { name: "info", maxCount: 1 }
    ]),
    (req, res, next) => {

        if (!req.files?.avt?.[0] || !req.files?.info?.[0]) {
            return res.status(400).json({
                success: false,
                message: "Thiếu file avt hoặc info"
            });
        }

        const infoFile = req.files.info[0];
        const imageFile = req.files.avt[0];

        let data;

        try {
            const jsonText = fs.readFileSync(infoFile.path, "utf8");
            data = JSON.parse(jsonText);

        } catch (error) {
            fs.unlinkSync(infoFile.path);
            fs.unlinkSync(imageFile.path);

            return res.status(400).json({
                success: false,
                message: "Dữ liệu info không hợp lệ"
            });
        }

        if (
            typeof data.identity_key !== "string" ||
            typeof data.full_name !== "string" ||
            typeof data.school !== "string" ||
            data.identity_key.trim() === "" ||
            data.full_name.trim() === "" ||
            data.school.trim() === ""
        ) {
            fs.unlinkSync(infoFile.path);
            fs.unlinkSync(imageFile.path);

            return res.status(400).json({
                success: false,
                message: "Thông tin đăng ký không hợp lệ"
            });
        }

        try {
            // Lưu data và lấy ID dạng số sequential làm ticket
            const ticketId = db.saveOrUpdateParticipant(
                data.identity_key,
                data.full_name,
                data.school,
                imageFile.path
            );
            
            // File info không cần giữ nữa
            fs.unlinkSync(infoFile.path);

            return res.json({
                success: true,
                ticket_code: ticketId
            });

        } catch (error) {
            fs.unlinkSync(infoFile.path);
            fs.unlinkSync(imageFile.path);

            if (error.message === "ALREADY_CONFIRMED") {
                return res.status(409).json({
                    success: false,
                    message: "Thiết bị này đã tham gia và nhận ticket thành công!"
                });
            }

            next(error);
            return;
        }
    }
);

// Endpoint xác nhận client đã nhận được ticket an toàn
app.post("/api/confirm", (req, res) => {
    const { identity_key } = req.body;
    if (!identity_key) return res.status(400).json({ success: false });

    try {
        db.markAsConfirmed(identity_key);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

app.use(errorHandler);

app.listen(3000, () => {
    console.log("server running at http://localhost:3000");
});
