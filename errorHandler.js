function errorHandler(err, req, res, next) {
    console.error("Server error:", err);

    // Client gửi request không hợp lệ
    if (err instanceof SyntaxError && err.status === 400) {
        return res.status(400).json({
            success: false,
            message: "Dữ liệu JSON không hợp lệ"
        });
    }

    // Lỗi Multer
    if (err.name === "MulterError") {
        return res.status(400).json({
            success: false,
            message: "File upload không hợp lệ"
        });
    }

    // Lỗi mặc định của server
    return res.status(500).json({
        success: false,
        message: "Lỗi máy chủ, vui lòng thử lại"
    });
}

module.exports = errorHandler;