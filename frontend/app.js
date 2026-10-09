const fullname = document.getElementById("fullname");
const school = document.getElementById("school");
const avt = document.getElementById("avt");

const form = document.querySelector("form");
const button = document.getElementById("submit");
const result_element = document.getElementById("result"); // THÊM

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    // VALIDATION CLIENT

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

    // BẮT ĐẦU GỬI

    button.disabled = true;
    button.textContent = "Đang upload";

    try {

        const info = {
            identity_key: crypto.randomUUID(),
            full_name: fullname.value,
            school: school.value
        };

        const json_info = JSON.stringify(info);

        const jsonBlob = new Blob(
            [json_info],
            { type: "application/json" }
        );

        const form_data = new FormData();

        form_data.append("info", jsonBlob, "info.json");
        form_data.append("avt", avt.files[0], "avt.png");

        const response = await fetch(
            "/api/submit",
            {
                method: "POST",
                body: form_data
            }
        );

        const result = await response.json();

        // SERVER RESPONSE

        if (response.ok) {

            result_element.textContent = result.ticket_code;

            button.textContent = "Đăng ký thành công";

        } else if (response.status === 409) {

            result_element.textContent = result.message;

            button.textContent = "Đăng ký";
            button.disabled = false;

        } else {

            result_element.textContent =
                "Có lỗi xảy ra, vui lòng thử lại";

            button.textContent = "Đăng ký";
            button.disabled = false;
        }

    } catch (error) {

        // NETWORK / SERVER ERROR
        console.error("Request error:", error);

        result_element.textContent =
            "Có lỗi xảy ra, vui lòng thử lại";

        button.textContent = "Đăng ký";
        button.disabled = false;
    }
});