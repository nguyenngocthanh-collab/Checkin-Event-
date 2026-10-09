const fullname = document.getElementById("fullname");
const school = document.getElementById("school");
const avt = document.getElementById("avt");

const form = document.querySelector("form");
const button = document.getElementById("submit");
const result_element = document.getElementById("result");

// Hàm tạo ID ngẫu nhiên không phụ thuộc vào HTTPS (crypto.randomUUID yêu cầu HTTPS)
function generateDeviceID() {
    return 'dev-' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

// Tạo identity key cố định cho thiết bị để chống spam và khôi phục trạng thái
let identity_key = localStorage.getItem("identity_key");
if (!identity_key) {
    identity_key = generateDeviceID();
    localStorage.setItem("identity_key", identity_key);
}

// Kiểm tra trạng thái nếu người dùng vô tình reload trang
async function checkStatus() {
    try {
        const res = await fetch(`/api/status?identity_key=${identity_key}`);
        const data = await res.json();
        
        if (data.exists && data.status === 1) {
            // Thiết bị này đã hoàn tất quá trình
            form.style.display = "none";
            result_element.innerHTML = `Bạn đã đăng ký thành công!<br>Mã số vé của bạn là: <strong>#${data.ticket_code}</strong>`;
        } else if (data.exists && data.status === 0) {
            // Từng bị lỗi thoát giữa chừng chưa nhận ticket -> cho phép gửi đè
            console.log("Tìm thấy bản ghi chưa hoàn tất, cho phép tiếp tục.");
        }
    } catch (e) {
        console.error("Lỗi khi check status:", e);
    }
}
checkStatus();

// Hàm nén ảnh giảm dung lượng cực mạnh bằng canvas (Chống burst tải mạng)
function compressImage(file, quality = 0.6, maxWidth = 1000) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement("canvas");
                let width = img.width;
                let height = img.height;
                
                // Giữ tỷ lệ, resize nhỏ lại nếu ảnh quá lớn
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob((blob) => {
                    resolve(blob);
                }, "image/jpeg", quality);
            };
        };
    });
}

// Fetch bọc cơ chế tự động thử lại (Exponential backoff) khi rớt mạng
async function fetchWithRetry(url, options, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.status >= 500) throw new Error("Server Error");
            return response;
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            console.log(`Lỗi mạng, tự động thử lại lần ${i + 1}...`);
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i))); // 1s, 2s, 4s...
        }
    }
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (fullname.value.trim() === "") {
        result_element.textContent = "Vui lòng nhập họ và tên";
        return;
    }

    if (school.value.trim() === "") {
        result_element.textContent = "Vui lòng nhập trường đang học";
        return;
    }

    if (avt.files.length === 0) {
        result_element.textContent = "Vui lòng chọn ảnh";
        return;
    }

    button.disabled = true;
    button.textContent = "Đang nén ảnh (Chống nghẽn)...";

    try {
        // 1. NÉN ẢNH ĐỂ TIẾT KIỆM BĂNG THÔNG TUNNEL
        const compressedBlob = await compressImage(avt.files[0]);
        
        button.textContent = "Đang gửi dữ liệu lên máy chủ...";

        const info = {
            identity_key: identity_key,
            full_name: fullname.value,
            school: school.value
        };

        const form_data = new FormData();
        form_data.append("info", new Blob([JSON.stringify(info)], { type: "application/json" }), "info.json");
        form_data.append("avt", compressedBlob, "avt.jpg"); // Dùng file đã nén

        // 2. TỰ ĐỘNG RETRY NẾU RỚT MẠNG CLOUDFLARE
        const response = await fetchWithRetry("/api/submit", {
            method: "POST",
            body: form_data
        }, 5); // Tối đa thử lại 5 lần

        const result = await response.json();

        if (response.ok) {
            // 3. XÁC NHẬN (ACK) RẰNG CLIENT ĐÃ NHẬN TICKET
            // Nếu ACK lỗi hoặc client bị tắt ngay lúc này, DB trên server vẫn là status = 0 (chưa chốt)
            // Lần sau mở app lên họ vẫn có thể nộp lại.
            await fetchWithRetry("/api/confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ identity_key })
            }, 3);

            form.style.display = "none";
            result_element.innerHTML = `Đăng ký thành công!<br>Mã số vé của bạn là: <strong>#${result.ticket_code}</strong>`;
            
        } else if (response.status === 409) {
            result_element.textContent = result.message;
            button.textContent = "Đăng ký";
            button.disabled = false;
        } else {
            result_element.textContent = result.message || "Có lỗi xảy ra, vui lòng thử lại";
            button.textContent = "Đăng ký";
            button.disabled = false;
        }

    } catch (error) {
        console.error("Request error:", error);
        result_element.textContent = "Lỗi kết nối mạng, server bận hoặc đường truyền chậm. Vui lòng thử lại";
        button.textContent = "Thử lại";
        button.disabled = false;
    }
});