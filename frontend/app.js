// =====================================================
// CẤU HÌNH (tọa độ theo artboard Figma 393 x 852)
// =====================================================
const DESIGN_W = 393;
const DESIGN_H = 852;

// Vị trí top của frame.svg trên artboard
const FRAME_TOP = 100;

// Ô ảnh mặc định (chỉ dùng nếu tự dò lỗ trong frame thất bại).
// Bình thường giá trị này bị ghi đè bởi calibrateWindow().
let WINDOW = { x: 30, y: 245, w: 333, h: 425 };

// Cho ảnh thò ra dưới viền frame vài px để không hở khe
const BLEED = 3;

// Độ phân giải ảnh xuất ra (2 => rộng 786px). PNG khá nặng nên để 2.
// Nếu server chịu được file lớn, tăng lên 3 cho nét hơn.
const EXPORT_RATIO = 2;

// =====================================================
// ELEMENTS
// =====================================================
const app = document.getElementById('app-container');

const stageJoin = document.getElementById('stage-join');
const stageRegister = document.getElementById('stage-register');
const stageReview = document.getElementById('stage-review');
const stageTicket = document.getElementById('stage-ticket');

const btnStartJoin = document.getElementById('btn-start-join');
const btnSubmitRegister = document.getElementById('btn-submit-register');
const btnSubmitFinal = document.getElementById('btn-submit-final');
const btnRetake = document.getElementById('btn-retake');

const fullname = document.getElementById('fullname');
const school = document.getElementById('school');
const cameraInput = document.getElementById('camera-input');
const userPhoto = document.getElementById('user-photo');
const canvasWrapper = document.getElementById('canvas-wrapper');
const frameImg = document.getElementById('frame-img');
const ticketCodeEl = document.getElementById('ticket-code');

const resultOverlay = document.getElementById('result-overlay');
const resultText = document.getElementById('result-text');

let photoFile = null;

// =====================================================
// SCALING: vừa khít mọi màn hình, giữ tỉ lệ iPhone 16
// =====================================================
let appScale = 1;

function resizeApp() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    appScale = Math.min(vw / DESIGN_W, vh / DESIGN_H);
    app.style.transform = `translate(-50%, -50%) scale(${appScale})`;
}
window.addEventListener('resize', resizeApp);
window.addEventListener('orientationchange', resizeApp);
resizeApp();

// =====================================================
// Ô ẢNH: đặt vị trí + tự dò lỗ trong frame.svg
// =====================================================
let BOX_W = 0, BOX_H = 0; // kích thước vùng ảnh (đã tính bleed)

function layoutWindow() {
    frameImg.style.top = FRAME_TOP + 'px';
    canvasWrapper.style.left = (WINDOW.x - BLEED) + 'px';
    canvasWrapper.style.top = (WINDOW.y - BLEED) + 'px';
    canvasWrapper.style.width = (WINDOW.w + BLEED * 2) + 'px';
    canvasWrapper.style.height = (WINDOW.h + BLEED * 2) + 'px';
    BOX_W = WINDOW.w + BLEED * 2;
    BOX_H = WINDOW.h + BLEED * 2;
}

// Đọc kênh alpha của frame để tìm phần lỗ trong suốt ở giữa
function calibrateWindow() {
    try {
        const K = 3; // độ phân giải khi dò
        const fw = frameImg.naturalWidth;
        const fh = frameImg.naturalHeight;
        if (!fw || !fh) throw new Error('frame chưa có kích thước');

        const cw = DESIGN_W * K;
        const ch = Math.round(DESIGN_W * (fh / fw) * K);

        const c = document.createElement('canvas');
        c.width = cw;
        c.height = ch;
        const cx = c.getContext('2d', { willReadFrequently: true });
        cx.drawImage(frameImg, 0, 0, cw, ch);
        const data = cx.getImageData(0, 0, cw, ch).data;

        const solid = (x, y) => data[(y * cw + x) * 4 + 3] > 140;

        const midX = Math.floor(cw / 2);
        const midY = Math.floor(ch / 2);
        if (solid(midX, midY)) throw new Error('tâm frame không trong suốt');

        // Quét lên / xuống tại vài cột (tránh cột giữa vì có ngôi sao)
        let top = Infinity, bottom = -Infinity;
        for (const f of [0.25, 0.35, 0.65, 0.75]) {
            const x = Math.floor(cw * f);
            if (solid(x, midY)) continue;
            let y = midY;
            while (y > 0 && !solid(x, y)) y--;
            if (y > 0) top = Math.min(top, y + 1);
            y = midY;
            while (y < ch - 1 && !solid(x, y)) y++;
            if (y < ch - 1) bottom = Math.max(bottom, y);
        }

        // Quét trái / phải tại vài hàng nằm trong lỗ
        let left = Infinity, right = -Infinity;
        const y0 = Math.max(top, 0), y1 = Math.min(bottom, ch - 1);
        for (const f of [0.35, 0.5, 0.65]) {
            const y = Math.floor(y0 + (y1 - y0) * f);
            if (solid(midX, y)) continue;
            let x = midX;
            while (x > 0 && !solid(x, y)) x--;
            if (x > 0) left = Math.min(left, x + 1);
            x = midX;
            while (x < cw - 1 && !solid(x, y)) x++;
            if (x < cw - 1) right = Math.max(right, x);
        }

        if (![top, bottom, left, right].every(Number.isFinite)) {
            throw new Error('không dò được lỗ');
        }

        WINDOW = {
            x: left / K,
            y: FRAME_TOP + top / K,
            w: (right - left) / K,
            h: (bottom - top) / K
        };
        console.log('WINDOW tự dò được:', WINDOW);
    } catch (e) {
        console.warn('Không tự dò được lỗ frame, dùng WINDOW mặc định:', e.message);
    }

    layoutWindow();
    if (userPhoto.naturalWidth) initPhoto(); // nếu ảnh đã có thì căn lại
}

layoutWindow();
if (frameImg.complete && frameImg.naturalWidth) {
    calibrateWindow();
} else {
    frameImg.addEventListener('load', calibrateWindow, { once: true });
}

// =====================================================
// STAGE SWITCHING + TRANG TICKET
// =====================================================
function switchStage(stageEl) {
    document.querySelectorAll('.stage').forEach(el => el.classList.remove('active'));
    stageEl.classList.add('active');
}

function showTicket(code) {
    ticketCodeEl.textContent = '#' + code;
    resultOverlay.classList.add('hidden');
    switchStage(stageTicket);
}

// =====================================================
// ID / STATUS
// =====================================================
function generateDeviceID() {
    return 'dev-' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
}
let identity_key = localStorage.getItem("identity_key");
if (!identity_key) {
    identity_key = generateDeviceID();
    localStorage.setItem("identity_key", identity_key);
}

async function fetchStatus() {
    const res = await fetch(`/api/status?identity_key=${identity_key}`);
    return await res.json();
}


async function checkStatus() {
  try {
    const data = await fetchStatus();

    if (data.exists && data.ticket_code != null) {
      showTicket(data.ticket_code);

      if (data.status !== 1) {
        confirmUntilAcknowledged(identity_key);
      }
    }
  } catch (error) {
    console.error("Không kiểm tra được trạng thái đăng ký:", error);
  }
}

checkStatus();

// =====================================================
// ĐIỀU HƯỚNG CƠ BẢN
// =====================================================
btnStartJoin.addEventListener('click', () => switchStage(stageRegister));

btnSubmitRegister.addEventListener('click', () => {
    if (fullname.value.trim() === "" || school.value.trim() === "") {
        alert("Vui lòng nhập đầy đủ thông tin.");
        return;
    }
    cameraInput.click();
});

// =====================================================
// ẢNH NGƯỜI DÙNG: PAN / ZOOM
// =====================================================
let nw = 1, nh = 1;       // kích thước gốc của ảnh
let s = 1;                // scale hiện tại
let minS = 1, maxS = 5;
let tx = 0, ty = 0;       // dịch chuyển (đơn vị artboard, trong wrapper)

function applyTransform() {
    s = Math.max(minS, Math.min(maxS, s));
    const w = nw * s;
    const h = nh * s;
    tx = Math.min(0, Math.max(BOX_W - w, tx));
    ty = Math.min(0, Math.max(BOX_H - h, ty));
    userPhoto.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
}

function initPhoto() {
    nw = userPhoto.naturalWidth;
    nh = userPhoto.naturalHeight;
    if (!nw || !nh) return;
    userPhoto.style.width = nw + 'px';
    userPhoto.style.height = nh + 'px';

    // cover: phủ kín ô, căn giữa
    minS = Math.max(BOX_W / nw, BOX_H / nh);
    maxS = minS * 5;
    s = minS;
    tx = (BOX_W - nw * s) / 2;
    ty = (BOX_H - nh * s) / 2;
    applyTransform();
}

function zoomAt(newS, fx, fy, baseS, baseTx, baseTy) {
    newS = Math.max(minS, Math.min(maxS, newS));
    const ratio = newS / baseS;
    s = newS;
    tx = fx - (fx - baseTx) * ratio;
    ty = fy - (fy - baseTy) * ratio;
}

const hammer = new Hammer(canvasWrapper, { touchAction: 'none' });
hammer.get('pinch').set({ enable: true });
hammer.get('pan').set({ direction: Hammer.DIRECTION_ALL, threshold: 0 });
hammer.get('pinch').recognizeWith(hammer.get('pan'));

let g = null;

function onGesture(e) {
    const n = e.pointers.length;
    if (!g || g.n !== n) {
        g = { n, s, tx, ty, cx: e.center.x, cy: e.center.y, k: e.scale };
    }
    const rect = canvasWrapper.getBoundingClientRect();
    const fx = (g.cx - rect.left) / appScale;
    const fy = (g.cy - rect.top) / appScale;

    const wantS = n >= 2 ? g.s * (e.scale / g.k) : g.s;
    zoomAt(wantS, fx, fy, g.s, g.tx, g.ty);

    tx += (e.center.x - g.cx) / appScale;
    ty += (e.center.y - g.cy) / appScale;
    applyTransform();
}
hammer.on('panstart panmove pinchstart pinchmove', onGesture);
hammer.on('panend pancancel pinchend pinchcancel', () => { g = null; });

canvasWrapper.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvasWrapper.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / appScale;
    const fy = (e.clientY - rect.top) / appScale;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    zoomAt(s * factor, fx, fy, s, tx, ty);
    applyTransform();
}, { passive: false });

userPhoto.addEventListener('load', initPhoto);

cameraInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
        photoFile = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (event) => {
            userPhoto.src = event.target.result;
            switchStage(stageReview);
        };
        reader.readAsDataURL(photoFile);
    }
});

btnRetake.addEventListener('click', () => {
    cameraInput.value = "";
    cameraInput.click();
});

// =====================================================
// XUẤT ẢNH: ẢNH + FRAME, NỀN TRONG SUỐT (PNG)
// =====================================================
let submitting = false;

btnSubmitFinal.addEventListener('click', async () => {
    if (submitting) return;
    submitting = true;
    showResult("Đang xử lý ảnh...");

    try {
        if (frameImg.decode) { await frameImg.decode().catch(() => {}); }
        if (userPhoto.decode) { await userPhoto.decode().catch(() => {}); }

        const frameH = frameImg.offsetHeight ||
            Math.round(DESIGN_W * (frameImg.naturalHeight / frameImg.naturalWidth));

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(DESIGN_W * EXPORT_RATIO);
        canvas.height = Math.round(frameH * EXPORT_RATIO);
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Gốc tọa độ = mép trên của frame. Không tô nền -> giữ nguyên độ trong suốt.
        ctx.scale(EXPORT_RATIO, EXPORT_RATIO);
        ctx.translate(0, -FRAME_TOP);

        const bx = WINDOW.x - BLEED;
        const by = WINDOW.y - BLEED;

        // Ảnh người dùng, cắt trong ô
        ctx.save();
        ctx.beginPath();
        ctx.rect(bx, by, BOX_W, BOX_H);
        ctx.clip();
        ctx.drawImage(userPhoto, bx + tx, by + ty, nw * s, nh * s);
        ctx.restore();

        // Frame đè lên
        ctx.drawImage(frameImg, 0, FRAME_TOP, DESIGN_W, frameH);

        // PNG để giữ kênh alpha (JPEG sẽ biến vùng trong suốt thành đen)
        canvas.toBlob(async (blob) => {
            if (!blob) {
                showResult("Lỗi tạo ảnh. Vui lòng thử lại.");
                setTimeout(() => resultOverlay.classList.add('hidden'), 2000);
                submitting = false;
                return;
            }
            await uploadData(blob);
            submitting = false;
        }, "image/png");

    } catch (e) {
        console.error(e);
        showResult("Lỗi tạo ảnh. Vui lòng thử lại.");
        setTimeout(() => resultOverlay.classList.add('hidden'), 2000);
        submitting = false;
    }
});

// =====================================================
// UPLOAD
// =====================================================
async function fetchWithRetry(url, options, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.status >= 500) throw new Error("Server Error");
            return response;
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
        }
    }
}

// Đã đăng ký từ trước (409): lấy mã vé và nhảy sang trang ticket
async function handleAlreadyRegistered(result) {
    if (result && result.ticket_code) {
        showTicket(result.ticket_code);
        return;
    }
    try {
        const data = await fetchStatus();
        if (data.exists && data.status === 1) {
            showTicket(data.ticket_code);
            return;
        }
    } catch (e) {
        console.error(e);
    }
    showResult((result && result.message) || "Bạn đã đăng ký rồi");
    setTimeout(() => resultOverlay.classList.add('hidden'), 3000);
}


async function uploadData(imageBlob) {
  showResult(
    "Đang lưu đăng ký...<br><br>" +
    "Khi có nhiều người cùng tham gia, quá trình có thể lâu hơn bình thường.<br><br>" +
    "Vui lòng giữ trang mở, không đóng trình duyệt hoặc xóa dữ liệu."
  );

  try {
    await ReliableSubmit.send({
      identityKey: identity_key,
      fullName: fullname.value.trim(),
      school: school.value.trim(),
      imageBlob,

      onStatus(message) {
        showResult(
          `${message}<br><br>` +
          "Vui lòng giữ trang mở. Hệ thống đang tự xử lý."
        );
      },

      onSuccess(result) {
        showTicket(result.ticket_code);

        // Xác nhận trạng thái riêng; không làm mất mã vé đã nhận.
        confirmUntilAcknowledged(identity_key);
      },

      onPermanentError(message) {
        showResult(
          `${message}<br><br>` +
          "Hãy kiểm tra thông tin rồi thử đăng ký lại."
        );
      }
    });
  } catch (error) {
    console.error("Lỗi gửi đăng ký:", error);

    if (error.permanent) {
      showResult(
        "Dữ liệu đăng ký chưa hợp lệ.<br><br>" +
        "Vui lòng kiểm tra thông tin và thử lại."
      );
    } else {
      showResult(
        "Chưa lưu được yêu cầu vào bộ nhớ trình duyệt.<br><br>" +
        "Kiểm tra dung lượng lưu trữ hoặc cài đặt trình duyệt rồi thử lại."
      );
    }
  }
}

async function confirmUntilAcknowledged(identityKey) {
  let attempt = 0;

  while (true) {
    try {
      const response = await fetch("/api/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          identity_key: identityKey
        })
      });

      if (response.ok) return;

      if (response.status === 404) {
        // Đăng ký có thể chưa được tìm thấy do lỗi bất thường.
        // Không kết luận rằng vé đã mất.
        console.error("Chưa tìm thấy bản ghi để xác nhận vé.");
      }
    } catch (error) {
      console.error("Lỗi xác nhận trạng thái:", error);
    }

    attempt++;

    const delay = Math.min(
      1000 * 2 ** Math.min(attempt, 5),
      30000
    );

    await new Promise(resolve => setTimeout(resolve, delay));
  }
}


function showResult(html) {
    resultOverlay.classList.remove('hidden');
    resultText.innerHTML = html;
}

ReliableSubmit.resumePending({
  onStatus(message) {
    showResult(
      `${message}<br><br>` +
      "Đang khôi phục đăng ký trước đó. Vui lòng giữ trang mở."
    );
  },

  onSuccess(result) {
    showTicket(result.ticket_code);
    confirmUntilAcknowledged(identity_key);
  },

  onPermanentError(message) {
    showResult(
      `${message}<br><br>` +
      "Yêu cầu trước đó cần được kiểm tra trước khi tiếp tục."
    );
  }
}).catch(error => {
  console.error("Không khôi phục được hàng đợi:", error);
});
