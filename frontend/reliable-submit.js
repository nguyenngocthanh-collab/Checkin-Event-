
const ReliableSubmit = (() => {
  const DB_NAME = "event-registration-queue";
  const STORE_NAME = "pending";
  let active = false;

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, {
            keyPath: "submission_id"
          });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function putRecord(record) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(record);

      tx.oncomplete = () => {
        db.close();
        resolve();
      };

      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };

      tx.onabort = () => {
        db.close();
        reject(tx.error || new Error("Không lưu được hàng đợi."));
      };
    });
  }

  async function deleteRecord(submissionId) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(submissionId);

      tx.oncomplete = () => {
        db.close();
        resolve();
      };

      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  }

  async function getAllRecords() {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => reject(request.error);

      tx.oncomplete = () => db.close();
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  }

  const sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

  function notify(callback, value) {
    try {
      callback?.(value);
    } catch (error) {
      console.error("Lỗi callback:", error);
    }
  }

  async function uploadUntilAcknowledged(record, options = {}) {
    let attempt = 0;

    while (true) {
      try {
        notify(
          options.onStatus,
          attempt === 0
            ? "Đang gửi đăng ký lên máy chủ..."
            : `Mạng hoặc máy chủ đang gặp lỗi. Đang thử lại lần ${attempt}...`
        );

        const form = new FormData();

        form.append(
          "info",
          new Blob(
            [
              JSON.stringify({
                identity_key: record.identity_key,
                submission_id: record.submission_id,
                full_name: record.full_name,
                school: record.school
              })
            ],
            { type: "application/json" }
          ),
          "info.json"
        );

        form.append("avt", record.imageBlob, "avatar.png");

        const response = await fetch("/api/submit", {
          method: "POST",
          body: form
        });

        let result = {};

        try {
          result = await response.json();
        } catch {
          // Server có thể ngắt phản hồi giữa chừng.
        }

        if (
          response.ok &&
          result.success &&
          result.ticket_code != null
        ) {
          // Máy chủ đã trả về vé. Xóa bản chờ cục bộ.
          // Nếu trình duyệt lỗi trước khi xóa, gửi lại vẫn nhận cùng vé.
          await deleteRecord(record.submission_id);

          notify(options.onSuccess, result);
          return result;
        }

        // Các lỗi này cần sửa dữ liệu hoặc định dạng,
        // không nên lặp vô hạn với cùng payload.
        const permanent =
          response.status === 400 ||
          response.status === 413 ||
          response.status === 415 ||
          response.status === 422;

        if (permanent) {
          const error = new Error(
            result.message || `Dữ liệu không hợp lệ (HTTP ${response.status}).`
          );
          error.permanent = true;

          notify(options.onPermanentError, error.message);
          throw error;
        }

        throw new Error(
          result.message || `Máy chủ trả về HTTP ${response.status}.`
        );
      } catch (error) {
        if (error.permanent) {
          // Giữ bản ghi trong IndexedDB để có thể điều tra hoặc khôi phục.
          throw error;
        }

        attempt++;

        const delay = Math.min(
          1000 * 2 ** Math.min(attempt, 5),
          30000
        );

        notify(
          options.onStatus,
          "Chưa nhận được xác nhận từ máy chủ. " +
          "Vui lòng giữ trang mở; hệ thống sẽ tự thử lại."
        );

        await sleep(delay);
      }
    }
  }

  async function send({
    identityKey,
    fullName,
    school,
    imageBlob,
    onStatus,
    onSuccess,
    onPermanentError
  }) {
    if (active) {
      throw new Error("Đang xử lý một yêu cầu đăng ký.");
    }

    active = true;

    try {
      const record = {
        submission_id: crypto.randomUUID(),
        identity_key: identityKey,
        full_name: fullName,
        school,
        imageBlob,
        created_at: Date.now()
      };

      // Nếu bước này thất bại, không gửi dữ liệu chưa được lưu cục bộ.
      await putRecord(record);

      return await uploadUntilAcknowledged(record, {
        onStatus,
        onSuccess,
        onPermanentError
      });
    } finally {
      active = false;
    }
  }

  async function resumePending(options = {}) {
    if (active) return;

    active = true;

    try {
      const records = (await getAllRecords())
        .sort((a, b) => a.created_at - b.created_at);

      for (const record of records) {
        await uploadUntilAcknowledged(record, options);
      }
    } finally {
      active = false;
    }
  }

  return {
    send,
    resumePending
  };
})();
