// =====================================================
// CẤU HÌNH
// =====================================================
// Thứ tự quay (từ trên xuống). Phần tử CUỐI là giải to nhất, hiện ở giữa trang kết quả.
const PRIZES = ["GIẢI BA", "GIẢI NHÌ", "GIẢI NHẤT"];
const SPIN_MS = 7000;      // thời gian quay mỗi lượt
const MAX_LABELS = 40;     // từ số người này trở xuống thì in mã vé trên từng ô

// Thứ tự hiện ở trang kết quả (chỉ số trong PRIZES): Nhì - Nhất - Ba
const DISPLAY_ORDER = [1, 2, 0];

// =====================================================
// ELEMENTS
// =====================================================
const stageWheel = document.getElementById("stage-wheel");
const stageResults = document.getElementById("stage-results");

const totalEl = document.getElementById("total");
const drawnEl = document.getElementById("drawn");
const canvas = document.getElementById("wheel");
const ctx = canvas.getContext("2d");

const prizeEl = document.getElementById("current-prize");
const ticketEl = document.getElementById("current-ticket");
const nameEl = document.getElementById("current-name");
const messageEl = document.getElementById("message");
const spinButton = document.getElementById("spin");
const backButton = document.getElementById("back");
const podiumEl = document.getElementById("podium");

// =====================================================
// TRẠNG THÁI
// =====================================================
const TAU = Math.PI * 2;
let pool = [];          // những người còn trong vòng quay
let winners = [];       // người đã trúng, theo thứ tự quay
let rotation = 0;       // góc quay hiện tại của vòng (radian, chiều kim đồng hồ)
let isSpinning = false;
let wheelDirty = false; // true khi có người vừa trúng -> vẽ lại vòng ở lượt sau

const mod = (a, n) => ((a % n) + n) % n;

// =====================================================
// TẢI DANH SÁCH
// =====================================================
async function loadParticipants() {
  spinButton.disabled = true;
  messageEl.textContent = "Đang tải danh sách người tham gia...";

  try {
    const response = await fetch("/api/participants");
    if (!response.ok) throw new Error("Không đọc được danh sách.");

    const data = await response.json();
    pool = (data.participants || []).slice();
    totalEl.textContent = data.total ?? pool.length;

    if (pool.length < PRIZES.length) {
      messageEl.textContent =
        `Cần ít nhất ${PRIZES.length} người tham gia hợp lệ để quay đủ ${PRIZES.length} giải.`;
      drawWheel();
      return;
    }

    drawWheel();
    prizeEl.textContent = PRIZES[0];
    messageEl.textContent = "Danh sách đã sẵn sàng. Nhấn nút hoặc phím Space để quay.";
    spinButton.textContent = `QUAY ${PRIZES[0]}`;
    spinButton.disabled = false;
  } catch (error) {
    console.error(error);
    messageEl.textContent = "Lỗi tải dữ liệu. Hãy kiểm tra raffle/server.js.";
  }
}

// =====================================================
// RANDOM AN TOÀN
// =====================================================
function secureRandomIndex(max) {
  const random = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / max) * max;
  let value;
  do {
    crypto.getRandomValues(random);
    value = random[0];
  } while (value >= limit);
  return value % max;
}

// =====================================================
// VẼ VÒNG QUAY
// Ô số 0 bắt đầu ở đỉnh (12 giờ) và đi theo chiều kim đồng hồ.
// =====================================================
const COLORS = ["#1b2547", "#2d2a63", "#223157", "#3b2f6e"];

function drawWheel() {
  const size = canvas.width;
  const c = size / 2;
  const outer = c - 6;
  const inner = outer - 26;

  ctx.clearRect(0, 0, size, size);

  // Viền ngoài vàng
  const ring = ctx.createLinearGradient(0, 0, size, size);
  ring.addColorStop(0, "#fff0bd");
  ring.addColorStop(0.5, "#d9a648");
  ring.addColorStop(1, "#fff0bd");
  ctx.beginPath();
  ctx.arc(c, c, outer, 0, TAU);
  ctx.fillStyle = ring;
  ctx.fill();

  const n = pool.length;
  if (n === 0) {
    ctx.beginPath();
    ctx.arc(c, c, inner, 0, TAU);
    ctx.fillStyle = COLORS[0];
    ctx.fill();
  } else {
    const seg = TAU / n;

    for (let i = 0; i < n; i++) {
      const a0 = i * seg - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, inner, a0, a0 + seg);
      ctx.closePath();
      // Ô cuối không trùng màu với ô đầu
      const colorIdx = (n % COLORS.length !== 1 || i !== n - 1)
        ? i % COLORS.length
        : 2;
      ctx.fillStyle = COLORS[colorIdx];
      ctx.fill();

      if (n <= 120) {
        ctx.strokeStyle = "#d2b16b66";
        ctx.lineWidth = n <= 40 ? 3 : 1;
        ctx.stroke();
      }
    }

    // Mã vé trên từng ô (khi ít người)
    if (n <= MAX_LABELS) {
      const fontSize = Math.max(22, Math.min(64, inner * seg * 0.28));
      ctx.font = `800 ${fontSize}px "Segoe UI", sans-serif`;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#f6d98d";
      for (let i = 0; i < n; i++) {
        ctx.save();
        ctx.translate(c, c);
        ctx.rotate(i * seg + seg / 2 - Math.PI / 2);
        ctx.fillText(String(pool[i].id), inner - 36, 0);
        ctx.restore();
      }
    }
  }

  // Vòng vàng mảnh phía trong
  ctx.beginPath();
  ctx.arc(c, c, inner, 0, TAU);
  ctx.strokeStyle = "#f3d58a";
  ctx.lineWidth = 6;
  ctx.stroke();

  rotation = 0;
  canvas.style.transform = "rotate(0rad)";
  wheelDirty = false;
}

// Ô đang nằm dưới mũi tên (ở đỉnh) khi vòng quay một góc R
function indexUnderPointer(R) {
  const seg = TAU / pool.length;
  return Math.floor(mod(-R, TAU) / seg) % pool.length;
}

// =====================================================
// QUAY
// =====================================================
const easeOut = t => 1 - Math.pow(1 - t, 4);

function showUnderPointer(i) {
  ticketEl.textContent = "#" + pool[i].id;
  nameEl.textContent = pool[i].full_name;
}

function spinOnce() {
  if (isSpinning || winners.length >= PRIZES.length) return;
  if (pool.length === 0) return;

  if (wheelDirty) drawWheel();

  isSpinning = true;
  spinButton.disabled = true;

  const rank = winners.length;
  const n = pool.length;
  const seg = TAU / n;

  // 1) Chọn người trúng bằng random an toàn TRƯỚC
  const winnerIndex = secureRandomIndex(n);
  const winner = pool[winnerIndex];

  // 2) Tính góc dừng sao cho mũi tên chỉ đúng ô của người đó
  const jitter = 0.15 + Math.random() * 0.7; // vị trí ngẫu nhiên trong ô (tránh sát mép)
  const base = -(winnerIndex + jitter) * seg;
  const start = rotation;
  const delta = mod(base - start, TAU);
  const turns = 7 + Math.floor(Math.random() * 2);
  const target = start + delta + turns * TAU;

  prizeEl.textContent = PRIZES[rank];
  messageEl.textContent = `Đang quay ${PRIZES[rank].toLowerCase()}...`;
  nameEl.innerHTML = "&nbsp;";

  const t0 = performance.now();
  let lastIdx = -1;

  function frame(now) {
    const t = Math.min(1, (now - t0) / SPIN_MS);
    rotation = start + (target - start) * easeOut(t);
    canvas.style.transform = `rotate(${rotation}rad)`;

    const idx = indexUnderPointer(rotation);
    if (idx !== lastIdx) {
      lastIdx = idx;
      showUnderPointer(idx);
    }

    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      finishSpin(winner, winnerIndex, rank);
    }
  }
  requestAnimationFrame(frame);
}

function finishSpin(winner, winnerIndex, rank) {
  ticketEl.textContent = "#" + winner.id;
  nameEl.textContent = winner.full_name;

  winners.push(winner);
  pool.splice(winnerIndex, 1); // loại khỏi vòng quay
  wheelDirty = true;

  drawnEl.textContent = `${winners.length} / ${PRIZES.length}`;

  if (winners.length === PRIZES.length) {
    messageEl.textContent = "Đã quay đủ giải. Nhấn để công bố kết quả!";
    spinButton.textContent = "CÔNG BỐ KẾT QUẢ";
  } else {
    messageEl.textContent = `Chúc mừng người trúng ${PRIZES[rank].toLowerCase()}!`;
    spinButton.textContent = `QUAY ${PRIZES[winners.length]}`;
  }

  isSpinning = false;
  spinButton.disabled = false;
}

// =====================================================
// TRANG KẾT QUẢ: ảnh ở trên, thông tin ở dưới
// =====================================================
function buildResults() {
  podiumEl.replaceChildren();

  DISPLAY_ORDER.forEach((prizeIdx, order) => {
    const person = winners[prizeIdx];
    if (!person) return;

    const card = document.createElement("article");
    card.className = "winner-card";
    if (prizeIdx === PRIZES.length - 1) card.classList.add("featured");
    card.style.setProperty("--delay", (0.25 + order * 0.45) + "s");

    const image = document.createElement("img");
    image.className = "winner-photo";
    image.src = person.image_url;
    image.alt = `Ảnh của ${person.full_name}`;
    image.onerror = () => { image.alt = "Không tải được ảnh"; };

    const info = document.createElement("div");
    info.className = "winner-info";

    const label = document.createElement("small");
    label.textContent = PRIZES[prizeIdx];

    const name = document.createElement("h3");
    name.textContent = person.full_name;

    const school = document.createElement("p");
    school.textContent = person.school;

    const ticket = document.createElement("span");
    ticket.className = "ticket";
    ticket.textContent = `Mã vé #${person.id}`;

    info.append(label, name, school, ticket);
    card.append(image, info);
    podiumEl.append(card);
  });
}

function showStage(stage) {
  document.querySelectorAll(".stage").forEach(el => el.classList.remove("active"));
  stage.classList.add("active");
}

function showResults() {
  buildResults();
  showStage(stageResults);
}

// =====================================================
// SỰ KIỆN
// =====================================================
function onSpinButton() {
  spinButton.blur(); // tránh Space/Enter kích hoạt nút hai lần
  if (winners.length >= PRIZES.length) {
    showResults();
  } else {
    spinOnce();
  }
}

spinButton.addEventListener("click", onSpinButton);
backButton.addEventListener("click", () => showStage(stageWheel));

// Space / Enter để điều khiển bằng clicker hoặc bàn phím
document.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (e.code !== "Space" && e.code !== "Enter") return;
  if (!stageWheel.classList.contains("active")) return;
  e.preventDefault();
  if (!spinButton.disabled) onSpinButton();
});

loadParticipants();