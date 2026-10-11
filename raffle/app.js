
"use strict";

/* =====================================================
   CONFIGURATION
===================================================== */

const PRIZES = ["GIẢI BA", "GIẢI NHÌ", "GIẢI NHẤT"];
const DISPLAY_ORDER = [1, 2, 0];

const SPIN_MS = 7000;
const PREVIEW_MS = 8000;
const MAX_LABELS = 40;
const TAU = Math.PI * 2;

const COLORS = [
  "#1b2547",
  "#2d2a63",
  "#223157",
  "#3b2f6e"
];


/* =====================================================
   DOM
===================================================== */

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

const previewEl = document.getElementById("winner-preview");
const previewPhoto = document.getElementById("preview-photo");
const previewPrize = document.getElementById("preview-prize");
const previewName = document.getElementById("preview-name");
const previewSchool = document.getElementById("preview-school");
const previewTicket = document.getElementById("preview-ticket");


/* =====================================================
   STATE
===================================================== */

let participants = [];
let pool = [];
let winners = [];

let rotation = 0;
let isSpinning = false;
let wheelDirty = false;
let previewTimer = null;

const mod = (value, n) => ((value % n) + n) % n;


/* =====================================================
   PARTICIPANT HELPERS
===================================================== */

function getTicket(person) {
  return person.ticket_code
    ?? person.ticketCode
    ?? person.id
    ?? "N/A";
}

function getName(person) {
  return person.full_name
    ?? person.fullName
    ?? "Chưa có tên";
}

function getSchool(person) {
  return person.school ?? "";
}

function getImageUrl(person) {
  const raw =
    person.image_url ??
    person.image_path ??
    person.imagePath ??
    "";

  if (typeof raw !== "string" || !raw.trim()) {
    return "";
  }

  const value = raw.trim();

  if (/^(https?:\/\/|data:|blob:)/i.test(value)) {
    return value;
  }

  let path = value.replace(/\\/g, "/");

  // Hỗ trợ đường dẫn Windows tuyệt đối.
  if (/^[a-z]:\//i.test(path)) {
    path = "/uploads/" + path.split("/").pop();
  } else {
    path = path.replace(/^\.\/+/, "");

    if (path.startsWith("uploads/")) {
      path = "/" + path;
    } else if (!path.startsWith("/")) {
      path = "/" + path;
    }
  }

  return path;
}

function setImage(img, person) {
  const url = getImageUrl(person);

  img.removeAttribute("src");
  img.alt = `Ảnh của ${getName(person)}`;

  if (!url) {
    img.alt = "Người tham gia chưa có ảnh";
    return;
  }

  img.onerror = () => {
    img.onerror = null;
    img.removeAttribute("src");
    img.alt = "Không tải được ảnh người tham gia";
  };

  img.src = url;
}


/* =====================================================
   LOAD PARTICIPANTS
===================================================== */

async function loadParticipants() {
  spinButton.disabled = true;
  messageEl.textContent = "Đang tải danh sách người tham gia...";

  try {
    const response = await fetch("/api/participants", {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data.participants)) {
      throw new Error(
        "API phải trả về { participants: [...] }"
      );
    }

    participants = data.participants.slice();

    // Không đưa những bản ghi thiếu ID vào vòng quay.
    pool = participants.filter(person =>
      person &&
      person.id !== undefined &&
      person.id !== null
    );

    winners = [];

    totalEl.textContent = data.total ?? participants.length;
    drawnEl.textContent = `0 / ${PRIZES.length}`;

    drawWheel();

    if (pool.length < PRIZES.length) {
      prizeEl.textContent = "";
      ticketEl.textContent = "CHƯA ĐỦ NGƯỜI";
      nameEl.textContent = "";

      messageEl.textContent =
        `Cần ít nhất ${PRIZES.length} người có ID hợp lệ.`;

      return;
    }

    prizeEl.textContent = PRIZES[0];
    ticketEl.textContent = "SẴN SÀNG";
    nameEl.textContent = "";

    messageEl.textContent =
      "Danh sách đã sẵn sàng. Nhấn nút hoặc phím Space để quay.";

    spinButton.textContent = `QUAY ${PRIZES[0]}`;
    spinButton.disabled = false;

  } catch (error) {
    console.error("Không tải được danh sách:", error);

    messageEl.textContent =
      "Không tải được danh sách. Kiểm tra API /api/participants.";

    spinButton.disabled = true;
  }
}


/* =====================================================
   SECURE RANDOM
===================================================== */

function secureRandomIndex(max) {
  if (!Number.isSafeInteger(max) || max <= 0) {
    throw new Error("Số lượng người tham gia không hợp lệ.");
  }

  const random = new Uint32Array(1);
  const range = 0x100000000;
  const limit = Math.floor(range / max) * max;

  let value;

  do {
    crypto.getRandomValues(random);
    value = random[0];
  } while (value >= limit);

  return value % max;
}


/* =====================================================
   DRAW WHEEL
===================================================== */

function drawWheel() {
  const size = canvas.width;
  const center = size / 2;
  const outer = center - 6;
  const inner = outer - 26;

  ctx.clearRect(0, 0, size, size);

  const ring = ctx.createLinearGradient(0, 0, size, size);
  ring.addColorStop(0, "#fff0bd");
  ring.addColorStop(0.5, "#d9a648");
  ring.addColorStop(1, "#fff0bd");

  ctx.beginPath();
  ctx.arc(center, center, outer, 0, TAU);
  ctx.fillStyle = ring;
  ctx.fill();

  const count = pool.length;

  if (count === 0) {
    ctx.beginPath();
    ctx.arc(center, center, inner, 0, TAU);
    ctx.fillStyle = COLORS[0];
    ctx.fill();
  } else {
    const segment = TAU / count;

    for (let i = 0; i < count; i++) {
      const start = i * segment - Math.PI / 2;
      const end = start + segment;

      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, inner, start, end);
      ctx.closePath();

      const colorIndex =
        count % COLORS.length === 1 && i === count - 1
          ? 2
          : i % COLORS.length;

      ctx.fillStyle = COLORS[colorIndex];
      ctx.fill();

      if (count <= 120) {
        ctx.strokeStyle = "#d2b16b66";
        ctx.lineWidth = count <= MAX_LABELS ? 3 : 1;
        ctx.stroke();
      }
    }

    if (count <= MAX_LABELS) {
      const segment = TAU / count;
      const fontSize = Math.max(
        22,
        Math.min(64, inner * segment * 0.28)
      );

      ctx.font = `800 ${fontSize}px "Segoe UI", sans-serif`;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#f6d98d";

      for (let i = 0; i < count; i++) {
        ctx.save();
        ctx.translate(center, center);
        ctx.rotate(i * segment + segment / 2 - Math.PI / 2);

        ctx.fillText(String(getTicket(pool[i])), inner - 36, 0);

        ctx.restore();
      }
    }
  }

  ctx.beginPath();
  ctx.arc(center, center, inner, 0, TAU);
  ctx.strokeStyle = "#f3d58a";
  ctx.lineWidth = 6;
  ctx.stroke();

  rotation = 0;
  canvas.style.transform = "rotate(0rad)";
  wheelDirty = false;
}


/* =====================================================
   WINNER PREVIEW
===================================================== */

function hideWinnerPreview() {
  previewEl.hidden = true;

  if (previewTimer !== null) {
    clearTimeout(previewTimer);
    previewTimer = null;
  }
}

function showWinnerPreview(person, rank) {
  hideWinnerPreview();

  setImage(previewPhoto, person);

  previewPrize.textContent = PRIZES[rank];
  previewName.textContent = getName(person);
  previewSchool.textContent = getSchool(person);
  previewTicket.textContent = `Mã vé #${getTicket(person)}`;

  previewEl.hidden = false;

  // Chạy lại hiệu ứng khi có người thắng mới.
  previewEl.style.animation = "none";
  void previewEl.offsetWidth;
  previewEl.style.animation = "";

  previewTimer = setTimeout(() => {
    previewEl.hidden = true;
    previewTimer = null;
  }, PREVIEW_MS);
}


/* =====================================================
   WHEEL POINTER
===================================================== */

function indexUnderPointer(angle) {
  if (pool.length === 0) return -1;

  const segment = TAU / pool.length;
  return Math.floor(mod(-angle, TAU) / segment) % pool.length;
}

function showUnderPointer(index) {
  const person = pool[index];

  if (!person) return;

  ticketEl.textContent = `#${getTicket(person)}`;
  nameEl.textContent = getName(person);
}

function easeOut(t) {
  return 1 - Math.pow(1 - t, 4);
}


/* =====================================================
   SPIN
===================================================== */

function spinOnce() {
  if (isSpinning || winners.length >= PRIZES.length) {
    return;
  }

  if (pool.length === 0) {
    messageEl.textContent = "Không còn người tham gia.";
    spinButton.disabled = true;
    return;
  }

  if (wheelDirty) {
    drawWheel();
  }

  hideWinnerPreview();

  isSpinning = true;
  spinButton.disabled = true;

  const rank = winners.length;
  const count = pool.length;
  const segment = TAU / count;

  const winnerIndex = secureRandomIndex(count);
  const winner = pool[winnerIndex];

  // Chọn điểm dừng bên trong ô của người trúng.
  const jitter = 0.15 + Math.random() * 0.7;
  const targetBase = -(winnerIndex + jitter) * segment;

  const start = rotation;
  const delta = mod(targetBase - start, TAU);
  const turns = 7 + Math.floor(Math.random() * 3);
  const target = start + delta + turns * TAU;

  prizeEl.textContent = PRIZES[rank];
  ticketEl.textContent = "ĐANG QUAY";
  nameEl.textContent = "";

  messageEl.textContent =
    `Đang quay ${PRIZES[rank].toLowerCase()}...`;

  const startTime = performance.now();
  let lastIndex = -1;

  function frame(now) {
    const progress = Math.min(1, (now - startTime) / SPIN_MS);

    rotation = start + (target - start) * easeOut(progress);
    canvas.style.transform = `rotate(${rotation}rad)`;

    const index = indexUnderPointer(rotation);

    if (index !== lastIndex) {
      lastIndex = index;
      showUnderPointer(index);
    }

    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      rotation = target;
      canvas.style.transform = `rotate(${rotation}rad)`;

      finishSpin(winner, winnerIndex, rank);
    }
  }

  requestAnimationFrame(frame);
}


/* =====================================================
   FINISH SPIN
===================================================== */

function finishSpin(winner, winnerIndex, rank) {
  ticketEl.textContent = `#${getTicket(winner)}`;
  nameEl.textContent = getName(winner);

  winners.push(winner);

  // Người thắng không được xuất hiện trong các lượt tiếp theo.
  pool.splice(winnerIndex, 1);
  wheelDirty = true;

  drawnEl.textContent = `${winners.length} / ${PRIZES.length}`;

  // Hiện ảnh và thông tin tạm thời ở bên phải.
  showWinnerPreview(winner, rank);

  if (winners.length >= PRIZES.length) {
    messageEl.textContent =
      "Đã quay đủ giải. Nhấn nút để công bố kết quả!";

    spinButton.textContent = "CÔNG BỐ KẾT QUẢ";
  } else {
    messageEl.textContent =
      `Chúc mừng người trúng ${PRIZES[rank].toLowerCase()}!`;

    spinButton.textContent = `QUAY ${PRIZES[winners.length]}`;
  }

  isSpinning = false;
  spinButton.disabled = false;
}


/* =====================================================
   BUILD FINAL RESULTS
===================================================== */

function buildResults() {
  podiumEl.replaceChildren();

  DISPLAY_ORDER.forEach((prizeIndex, order) => {
    const person = winners[prizeIndex];

    if (!person) return;

    const card = document.createElement("article");
    card.className = "winner-card";

    // Giải nhất ở chính giữa và được phóng to.
    if (prizeIndex === 2) {
      card.classList.add("featured");
    }

    card.style.setProperty(
      "--delay",
      `${0.15 + order * 0.2}s`
    );

    const image = document.createElement("img");
    image.className = "winner-photo";
    setImage(image, person);

    const info = document.createElement("div");
    info.className = "winner-info";

    const label = document.createElement("small");
    label.textContent = PRIZES[prizeIndex];

    const name = document.createElement("h3");
    name.textContent = getName(person);

    const school = document.createElement("p");
    school.textContent = getSchool(person);

    const ticket = document.createElement("span");
    ticket.className = "ticket";
    ticket.textContent = `Mã vé #${getTicket(person)}`;

    info.append(label, name, school, ticket);
    card.append(image, info);
    podiumEl.append(card);
  });
}


/* =====================================================
   NAVIGATION
===================================================== */

function showStage(stage) {
  document.querySelectorAll(".stage").forEach(element => {
    element.classList.remove("active");
  });

  stage.classList.add("active");
}

function showResults() {
  if (winners.length !== PRIZES.length) {
    return;
  }

  hideWinnerPreview();
  buildResults();
  showStage(stageResults);
}


/* =====================================================
   EVENTS
===================================================== */

function onSpinButton() {
  spinButton.blur();

  if (isSpinning) return;

  if (winners.length >= PRIZES.length) {
    showResults();
  } else {
    spinOnce();
  }
}

spinButton.addEventListener("click", onSpinButton);

backButton.addEventListener("click", () => {
  hideWinnerPreview();
  showStage(stageWheel);
});

document.addEventListener("keydown", event => {
  if (event.repeat) return;

  if (event.code !== "Space" && event.code !== "Enter") {
    return;
  }

  if (!stageWheel.classList.contains("active")) {
    return;
  }

  const tag = event.target?.tagName;

  if (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT"
  ) {
    return;
  }

  event.preventDefault();

  if (!spinButton.disabled) {
    onSpinButton();
  }
});


/* =====================================================
   INIT
===================================================== */

loadParticipants();
