
const express = require("express");
const crypto = require("crypto");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const db = require("./db");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const ROOT = __dirname;
const UPLOAD_DIR = path.join(ROOT, "uploads");
const FRONTEND_DIR = path.join(ROOT, "frontend");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use(express.static(FRONTEND_DIR));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },

  filename: (_req, _file, cb) => {
    cb(null, `${crypto.randomUUID()}.png`);
  }
});

const upload = multer({
  storage,
  limits: {
    files: 2,
    fileSize: 12 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === "avt" && file.mimetype !== "image/png") {
      return cb(new Error("Ảnh đăng ký phải ở định dạng PNG."));
    }

    if (
      file.fieldname === "info" &&
      file.mimetype !== "application/json"
    ) {
      return cb(new Error("File thông tin phải là JSON."));
    }

    cb(null, true);
  }
});

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function safeUnlink(filePath) {
  if (!filePath) return;

  try {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(ROOT, filePath);

    if (
      absolutePath.startsWith(UPLOAD_DIR + path.sep) ||
      absolutePath.startsWith(path.join(ROOT, "temp") + path.sep)
    ) {
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
    }
  } catch (error) {
    console.error("Không xóa được file:", error.message);
  }
}

function getParticipantResponse(participant) {
  return {
    success: true,
    exists: true,
    ticket_code: participant.id,
    status: participant.status,
    submission_id: participant.submission_id || null
  };
}

app.get("/", (_req, res) => {
  res.send("The server is running");
});

// Khôi phục đăng ký đã được lưu.
app.get("/api/status", (req, res) => {
  const identityKey = normalizeText(req.query.identity_key);
  const submissionId = normalizeText(req.query.submission_id);

  if (!identityKey && !submissionId) {
    return res.status(400).json({
      success: false,
      message: "Thiếu identity_key hoặc submission_id"
    });
  }

  const participant =
    (submissionId
      ? db.getParticipantBySubmission(submissionId)
      : null) ||
    (identityKey
      ? db.getParticipant(identityKey)
      : null);

  if (!participant) {
    return res.json({
      success: true,
      exists: false
    });
  }

  return res.json(getParticipantResponse(participant));
});

// Nhận thông tin và ảnh.
app.post(
  "/api/submit",
  upload.fields([
    { name: "avt", maxCount: 1 },
    { name: "info", maxCount: 1 }
  ]),
  (req, res) => {
    const imageFile = req.files?.avt?.[0];
    const infoFile = req.files?.info?.[0];

    if (!imageFile || !infoFile) {
      safeUnlink(imageFile?.path);
      safeUnlink(infoFile?.path);

      return res.status(400).json({
        success: false,
        message: "Thiếu file ảnh hoặc file thông tin."
      });
    }

    let data;

    try {
      data = JSON.parse(fs.readFileSync(infoFile.path, "utf8"));
    } catch {
      safeUnlink(imageFile.path);
      safeUnlink(infoFile.path);

      return res.status(400).json({
        success: false,
        message: "File thông tin không hợp lệ."
      });
    }

    const identityKey = normalizeText(data.identity_key);
    const submissionId = normalizeText(data.submission_id);
    const fullName = normalizeText(data.full_name);
    const school = normalizeText(data.school);

    if (
      !identityKey ||
      !submissionId ||
      !fullName ||
      !school ||
      identityKey.length > 200 ||
      submissionId.length > 200 ||
      fullName.length > 200 ||
      school.length > 200
    ) {
      safeUnlink(imageFile.path);
      safeUnlink(infoFile.path);

      return res.status(400).json({
        success: false,
        message: "Thông tin đăng ký thiếu hoặc không hợp lệ."
      });
    }

    try {
      const saved = db.saveOrGetParticipant({
        identityKey,
        submissionId,
        fullName,
        school,
        imagePath: path.relative(ROOT, imageFile.path)
      });

      // Nếu là yêu cầu trùng, ảnh mới không được sử dụng.
      if (!saved.useUploadedImage) {
        safeUnlink(imageFile.path);
      }

      safeUnlink(infoFile.path);

      // Retry cùng yêu cầu luôn trả về vé đã tồn tại.
      return res.status(200).json({
        success: true,
        duplicate: saved.duplicate,
        ticket_code: saved.participant.id,
        status: saved.participant.status,
        submission_id:
          saved.participant.submission_id || submissionId,
        message: "Đã ghi nhận đăng ký."
      });
    } catch (error) {
      safeUnlink(imageFile.path);
      safeUnlink(infoFile.path);

      console.error("Lỗi /api/submit:", error);

      return res.status(500).json({
        success: false,
        message:
          "Máy chủ chưa xác nhận đăng ký. Hệ thống sẽ thử lại."
      });
    }
  }
);

// Xác nhận trạng thái vé. Có thể gọi nhiều lần.
app.post("/api/confirm", (req, res) => {
  const identityKey = normalizeText(req.body?.identity_key);

  if (!identityKey) {
    return res.status(400).json({
      success: false,
      message: "Thiếu identity_key."
    });
  }

  try {
    const found = db.markAsConfirmed(identityKey);

    if (!found) {
      return res.status(404).json({
        success: false,
        message: "Chưa tìm thấy người tham gia."
      });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("Lỗi /api/confirm:", error);

    return res.status(500).json({
      success: false,
      message: "Chưa xác nhận được trạng thái vé."
    });
  }
});

// Xử lý lỗi upload và lỗi server.
app.use((error, _req, res, _next) => {
  console.error("Lỗi server:", error);

  if (error instanceof multer.MulterError) {
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? "Ảnh vượt quá dung lượng cho phép (12 MB)."
        : `Lỗi tải file: ${error.message}`;

    return res.status(400).json({
      success: false,
      message
    });
  }

  if (error.message?.includes("định dạng")) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }

  return res.status(500).json({
    success: false,
    message: "Lỗi máy chủ."
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
