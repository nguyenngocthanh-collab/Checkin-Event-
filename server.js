const express = require("express");
const crypto = require("crypto");
const multer = require("multer");
const errorHandler = require("./errorHandler");
const fs = require("fs");
const db = require("./db");

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/"); // thư mục lưu file
    },
    filename: (req, file, cb) => {
        const name = crypto.randomUUID() + ".png";
        cb(null, name); // hàm randomuuid trả về một cái tên ngẫu nhiên
    }
});

const app = express();
const upload = multer({ storage });

app.use(express.json());
app.use(express.static("frontend"));

app.get('/', (req, res) => {
    res.send("The server is running");
});

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

            // JSON lỗi → xóa cả 2 file
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
            typeof data.school !== "string"
        ) {

            fs.unlinkSync(infoFile.path);
            fs.unlinkSync(imageFile.path);

            return res.status(400).json({
                success: false,
                message: "Thông tin đăng ký không hợp lệ"
            });
        }

        if (
            data.identity_key.trim() === "" ||
            data.full_name.trim() === "" ||
            data.school.trim() === ""
        ) {

            fs.unlinkSync(infoFile.path);
            fs.unlinkSync(imageFile.path);

            return res.status(400).json({
                success: false,
                message: "Thông tin đăng ký không được để trống"
            });
        }


        const ticket_code = crypto.randomUUID(); // TẠO MÃ DỰ THƯỞNG - TẠM THỜI DÙNG TICKET UUID-
        const imgpath = imageFile.path;


        try {
            db.createParticipant(
                data.identity_key,
                data.full_name,
                data.school,
                ticket_code,
                imgpath
            );

        } catch (error) {

            if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
                console.log("Identity đã tồn tại");

                // Duplicate → xóa file đã upload
                fs.unlinkSync(infoFile.path);
                fs.unlinkSync(imageFile.path);

                return res.status(409).json({
                    success: false,
                    message: "Thiết bị này đã tham gia"
                });
            }

            next(error);
            return;
        }

        fs.unlinkSync(infoFile.path);

        res.json({
            success: true,
            ticket_code
        });
    }
);
app.use(errorHandler);

app.listen(3000, () => {
    console.log("server running at http://localhost:3000");
});
