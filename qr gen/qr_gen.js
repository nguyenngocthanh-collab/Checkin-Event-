
const path = require("path");
const fs = require("fs");
const QRCode = require("qrcode");
const sharp = require("sharp");

const url = process.argv[2];

const template = path.join(__dirname, "template", "frame.png");
const outputDir = path.join(__dirname, "generated");
const output = path.join(outputDir, "qr.png");

const QR_SIZE = 390;

async function main() {
    if (!url || !/^https?:\/\//i.test(url)) {
        console.error(
            'Cách dùng: node qr_gen.js "https://your-tunnel.trycloudflare.com"'
        );
        process.exitCode = 1;
        return;
    }

    if (!fs.existsSync(template)) {
        throw new Error(`Không tìm thấy template: ${template}`);
    }

    fs.mkdirSync(outputDir, { recursive: true });

    const metadata = await sharp(template).metadata();
    const width = metadata.width;
    const height = metadata.height;

    if (QR_SIZE > width || QR_SIZE > height) {
        throw new Error("Kích thước QR lớn hơn template.");
    }

    // Căn QR vào chính giữa ảnh.
    const left = Math.round((width - QR_SIZE) / 2);
    const top = Math.round((height - QR_SIZE) / 2)-45;

    // QR đơn giản, tương phản cao, có viền trắng để dễ quét.
    const qrBuffer = await QRCode.toBuffer(url, {
        type: "png",
        width: QR_SIZE,
        margin: 4,
        errorCorrectionLevel: "M",
        color: {
            dark: "#000000",
            light: "#FFFFFF"
        }
    });

    // Ghép QR lên trên template gốc.
    await sharp(template)
        .composite([{
            input: qrBuffer,
            left,
            top
        }])
        .png()
        .toFile(output);

    console.log("Tạo QR thành công!");
    console.log(`URL: ${url}`);
    console.log(`Kích thước template: ${width} x ${height}`);
    console.log(`Kích thước QR: ${QR_SIZE} x ${QR_SIZE}`);
    console.log(`Vị trí QR: x=${left}, y=${top}`);
    console.log(`File kết quả: ${output}`);
}

main().catch(error => {
    console.error("Lỗi:", error.message);
    process.exitCode = 1;
});
