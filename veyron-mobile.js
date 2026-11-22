const VeyronMobile = (() => {
  const pendingKey = "printimage.veyron.pending";
  const category = String.raw`(?<kind>ไวนิล|สติ๊กเกอร์|สติกเกอร์|งานพิมพ์)`;
  const number = String.raw`[0-9๐-๙]+(?:\.[0-9๐-๙]+)?`;
  const dimensions = String.raw`(?:ขนาด\s*)?(?<wide>${number})\s*[x×*]\s*(?<long>${number})\s*(?<unit>มม\.?|ซม\.?|ม\.?|มิลลิเมตร|เซนติเมตร|เมตร|mm|cm|m)`;
  const customerFirst = new RegExp(String.raw`^(?:ลูกค้า\s*)?(?<customer>.+?)\s+(?:ประเภท(?:งาน)?\s*)?${category}\s+${dimensions}$`, "iu");
  const categoryFirst = new RegExp(String.raw`^${category}\s+${dimensions}\s+ลูกค้า\s*(?<customer>.+)$`, "iu");

  function parse(message) {
    const input = message.replace(/^(ลงใบงาน|ลงงานพิมพ์|บันทึกงานพิมพ์|บันทึกงาน)\s+/u, "");
    const fields = customerFirst.exec(input) ?? categoryFirst.exec(input);
    const customer = fields?.groups.customer.trim();
    if (!customer || customer.length > 120) {
      throw new Error("ระบุชื่อลูกค้า ประเภทงาน (ไวนิล สติ๊กเกอร์ หรืองานพิมพ์) และขนาดพร้อมหน่วย เช่น คุณเอ ไวนิล 120 × 80 ซม.");
    }
    const { kind, wide, long, unit } = fields.groups;
    const scale = /^(มม\.?|มิลลิเมตร|mm)$/iu.test(unit) ? 0.001 : /^(ซม\.?|เซนติเมตร|cm)$/iu.test(unit) ? 0.01 : 1;
    const metres = value => Number(value.replace(/[๐-๙]/gu, digit => String(digit.charCodeAt(0) - 0x0e50))) * scale;
    const width = metres(wide);
    const length = metres(long);
    if (![width, length].every(value => value >= 0.001 && value <= 1000 &&
        Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-7)) {
      throw new Error("ขนาดงานต้องอยู่ระหว่าง 1 มม. ถึง 1,000 เมตร และระบุละเอียดสุดได้ 1 มม.");
    }
    return { customer, category: kind === "สติกเกอร์" ? "สติ๊กเกอร์" : kind,
      width: Math.round(width * 1000) / 1000, length: Math.round(length * 1000) / 1000 };
  }

  function restorePending() {
    try {
      const pending = JSON.parse(sessionStorage.getItem(pendingKey));
      if (typeof pending?.message === "string" &&
          /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(pending.id)) return pending;
    } catch {}
    return null;
  }

  function storePending(pending) {
    try {
      if (pending) sessionStorage.setItem(pendingKey, JSON.stringify(pending));
      else sessionStorage.removeItem(pendingKey);
    } catch {}
  }

  function mount(createJob) {
    const screen = document.getElementById("veyronMobile");
    const thread = document.getElementById("veyronMobileThread");
    const messages = document.getElementById("veyronMobileMessages");
    const form = document.getElementById("veyronMobileForm");
    const input = document.getElementById("veyronMobileInput");
    const status = document.getElementById("veyronMobileStatus");
    const send = form.querySelector("button");
    let pending = restorePending();
    let ready = false;
    let saving = false;
    screen.hidden = false;
    if (pending) input.value = pending.message;

    function addMessage(text, style) {
      const message = document.createElement("p");
      message.className = "veyron-mobile-" + style;
      message.textContent = text;
      messages.append(message);
      thread.scrollTop = thread.scrollHeight;
      return message;
    }

    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (!ready || saving) return;
      const message = input.value.trim();
      let job;
      try {
        job = parse(message);
      } catch (error) {
        status.textContent = error.message;
        return;
      }

      if (pending?.message !== message) {
        pending = { id: crypto.randomUUID(), message };
        storePending(pending);
      }
      const sent = addMessage(message, "sent");
      saving = true;
      input.readOnly = true;
      send.disabled = true;
      status.textContent = "กำลังบันทึกใน PrintImage…";
      try {
        const record = await createJob({ ...job, id: pending.id });
        if (!record) throw new Error();
        addMessage(`บันทึกใบงานแล้ว${record.reference ? " · " + record.reference : ""}\n${job.customer} · ${job.category} · ${job.width} × ${job.length} ม.`, "reply");
        input.value = "";
        pending = null;
        storePending(null);
        status.textContent = "";
      } catch {
        sent.remove();
        status.textContent = "ยังยืนยันการบันทึกไม่ได้ กดส่งข้อความเดิมอีกครั้งเพื่อตรวจสอบหรือบันทึกต่อครับ";
      } finally {
        saving = false;
        input.readOnly = false;
        send.disabled = false;
      }
    });

    return () => {
      ready = true;
      input.disabled = false;
      send.disabled = saving;
      status.textContent = pending
        ? "มีข้อความที่รอยืนยันการบันทึก กดส่งข้อความเดิมอีกครั้งได้ครับ"
        : "";
    };
  }

  return { mount };
})();
