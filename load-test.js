const fs = require("fs");
const crypto = require("crypto");
const { performance } = require("perf_hooks");

const SERVER_URL = "http://localhost:3000/api/submit";
const IMAGE_PATH = "./test-image.png";

// Số request: node load-test.js 100
const TOTAL_REQUESTS = Number(process.argv[2]) || 10;

async function sendRequest(index, imageBlob) {
    const form = new FormData();

    const identityKey = crypto.randomUUID();

    const info = {
        identity_key: identityKey,
        full_name: `Test User ${index}`,
        school: "HAU"
    };

    form.append(
        "avt",
        imageBlob,
        "avt.png"
    );

    form.append(
        "info",
        new Blob(
            [JSON.stringify(info)],
            { type: "application/json" }
        ),
        "info.json"
    );

    const start = performance.now();

    try {
        const response = await fetch(SERVER_URL, {
            method: "POST",
            body: form
        });

        const end = performance.now();

        let body;

        try {
            body = await response.json();
        } catch {
            body = null;
        }

        return {
            index,
            success: response.ok,
            status: response.status,
            time: end - start,
            ticket: body?.ticket_code || null
        };

    } catch (error) {
        const end = performance.now();

        return {
            index,
            success: false,
            status: "NETWORK_ERROR",
            time: end - start,
            error: error.message
        };
    }
}

async function main() {
    console.log(`Starting load test: ${TOTAL_REQUESTS} requests`);

    if (!fs.existsSync(IMAGE_PATH)) {
        console.error(`Không tìm thấy ${IMAGE_PATH}`);
        process.exit(1);
    }

    const imageBuffer = fs.readFileSync(IMAGE_PATH);

    const imageBlob = new Blob(
        [imageBuffer],
        { type: "image/png" }
    );

    const start = performance.now();

    // Tạo burst: tất cả request được gửi gần như cùng lúc
    const promises = [];

    for (let i = 1; i <= TOTAL_REQUESTS; i++) {
        promises.push(sendRequest(i, imageBlob));
    }

    const results = await Promise.all(promises);

    const end = performance.now();

    const success = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    const times = results
        .map(r => r.time)
        .sort((a, b) => a - b);

    const average =
        times.reduce((sum, time) => sum + time, 0) / times.length;

    const p95 =
        times[Math.floor(times.length * 0.95)];

    const p99 =
        times[Math.floor(times.length * 0.99)];

    console.log("\n========== LOAD TEST RESULT ==========");

    console.log(`Total requests : ${TOTAL_REQUESTS}`);
    console.log(`Success        : ${success.length}`);
    console.log(`Failed         : ${failed.length}`);

    console.log(
        `Total time     : ${(end - start).toFixed(2)} ms`
    );

    console.log(
        `Average        : ${average.toFixed(2)} ms`
    );

    console.log(
        `P95            : ${p95.toFixed(2)} ms`
    );

    console.log(
        `P99            : ${p99.toFixed(2)} ms`
    );

    if (failed.length > 0) {
        console.log("\n========== FAILED REQUESTS ==========");

        for (const result of failed.slice(0, 20)) {
            console.log(result);
        }
    }

    console.log("\n======================================");
}

main();