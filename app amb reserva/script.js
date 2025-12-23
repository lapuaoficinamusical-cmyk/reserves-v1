(() => {
  "use strict";

  /* =========================
     CONFIG
  ========================= */
  const PRICE_PER_HOUR = 8;
  const MIN_CELLS = 2; // 1h (2 slots de 30')
  const MAX_CELLS = 6; // 3h (6 slots de 30')
  const MAX_HOURS_MONTH = 10;

  const BOOKING_WEBHOOK_URL =
    "https://script.google.com/macros/s/AKfycbxLlTjXDDFMc-HSlRleKfT7Kc8DDM7aPtiSKkBoN_K2BAnmq6XEa0vWQT16txK5MnPxyA/exec";

  const TIMES = [];
  for (let h = 9; h < 21; h++) {
    TIMES.push(`${String(h).padStart(2, "0")}:00`);
    TIMES.push(`${String(h).padStart(2, "0")}:30`);
  }

  // Festius Catalunya (format YYYY-MM-DD)
  const festiusCatalunya = [
    "2026-01-01","2026-01-06","2026-04-03","2026-04-06","2026-05-01","2026-06-24",
    "2026-08-15","2026-09-11","2026-10-12","2026-12-08","2026-12-25","2026-12-26",
    "2026-03-03","2026-06-29"
  ];

  /* =========================
     STATE
  ========================= */
  let selectedBuc = null;
  let selectedDate = null;
  let startCell = null;
  let endCell = null;

  let month = new Date().getMonth();
  let year = new Date().getFullYear();
  let cart = [];

  /* =========================
     HELPERS
  ========================= */
  const pad2 = (n) => String(n).padStart(2, "0");
  const isoDate = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
  const normalizeHHMM = (t) => {
    const s = String(t ?? "").trim();
    const m = s.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return s;
    return `${String(Number(m[1])).padStart(2, "0")}:${m[2]}`;
  };
  const unique = (arr) => Array.from(new Set(arr));

  function isDisabledDate(y, m, d) {
    const dateStr = isoDate(y, m, d);
    const day = new Date(y, m, d).getDay();
    return day === 0 || festiusCatalunya.includes(dateStr);
  }

  function keyForReservation(buc, date) {
    return `${buc}_${date}`;
  }

  function getLocalReserved(buc, date) {
    const key = keyForReservation(buc, date);
    const raw = localStorage.getItem(key);
    try {
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveLocalReserved(buc, date, reserved) {
    const key = keyForReservation(buc, date);
    localStorage.setItem(key, JSON.stringify(unique(reserved)));
  }

  function mergeReserved(backend, local) {
    return unique([...backend, ...local].map(normalizeHHMM));
  }

  function totalHoursInMonth(y, m) {
    return cart.reduce((sum, c) => {
      const cd = new Date(c.date);
      return (cd.getFullYear() === y && cd.getMonth() === m ? sum + c.dur : sum);
    }, 0);
  }

  function totalHoursInDay(dateStr) {
    return cart.reduce((sum, c) => (c.date === dateStr ? sum + c.dur : sum), 0);
  }

  function totalPrice() {
    return cart.reduce((sum, c) => sum + c.dur, 0) * PRICE_PER_HOUR;
  }

  /* =========================
     BACKEND
  ========================= */
  async function fetchAvailability(buc, date) {
    const url = new URL(BOOKING_WEBHOOK_URL);
    url.searchParams.set("action", "availability");
    url.searchParams.set("buc", buc);
    url.searchParams.set("date", date);
    url.searchParams.set("nocache", String(Date.now()));

    const res = await fetch(url.toString(), { method: "GET" });
    const text = await res.text();

    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      return [];
    }

    if (!json || !json.ok || !Array.isArray(json.reserved)) {
      return [];
    }

    return json.reserved.map(normalizeHHMM);
  }

  async function submitReservation(payload) {
    const url = new URL(BOOKING_WEBHOOK_URL);
    url.searchParams.set("action", "reserve");
    url.searchParams.set("name", payload.name);
    url.searchParams.set("email", payload.email);
    url.searchParams.set("createdAt", payload.createdAt);
    url.searchParams.set("totalHours", String(payload.totalHours));
    url.searchParams.set("totalPrice", String(payload.totalPrice));
    url.searchParams.set("pricePerHour", String(payload.pricePerHour || PRICE_PER_HOUR));
    url.searchParams.set("sendVerification", "true");
    url.searchParams.set("reservations", JSON.stringify(payload.reservations));

    const res = await fetch(url.toString(), { method: "GET" });
    const text = await res.text();

    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }

    if (!res.ok) return { ok: false, message: "Error HTTP en enviar la reserva." };
    if (json && json.ok === false) return { ok: false, message: json.error || "Error del servidor." };
    return { ok: true, data: json };
  }

  /* =========================
     MAIN
  ========================= */
  document.addEventListener("DOMContentLoaded", () => {
    /* ELEMENTS */
    const bucEls = document.querySelectorAll(".buc");
    const calendar = document.getElementById("calendar");
    const calendarHeader = document.getElementById("calendarHeader");
    const monthLabel = document.getElementById("monthLabel");
    const slotsEl = document.getElementById("slots");
    const selection = document.getElementById("selection");
    const rangeText = document.getElementById("rangeText");
    const cartText = document.getElementById("cartText");
    const addCartBtn = document.getElementById("addCart");
    const checkout = document.getElementById("checkout");
    const nameInput = document.getElementById("name");
    const emailInput = document.getElementById("email");
    const confirmBtn = document.getElementById("confirm");
    const summary = document.getElementById("summary");
    const durationEl = document.getElementById("duration");
    const priceEl = document.getElementById("price");

    /* MODAL */
    const introModal = document.getElementById("introModal");
    const closeIntro = document.getElementById("closeIntro");
    if (introModal && closeIntro) {
      introModal.style.display = "flex";
      closeIntro.addEventListener("click", () => {
        introModal.style.display = "none";
      });
      introModal.addEventListener("click", (event) => {
        if (event.target === introModal) introModal.style.display = "none";
      });
    }

    /* CALENDAR */
    function buildCalendar() {
      calendar.innerHTML = "";
      calendarHeader.innerHTML = "";

      const dayNames = ["Dl", "Dm", "Dc", "Dj", "Dv", "Ds", "Dg"];
      dayNames.forEach((d) => {
        const el = document.createElement("div");
        el.textContent = d;
        calendarHeader.appendChild(el);
      });

      const names = [
        "Gener","Febrer","Març","Abril","Maig","Juny","Juliol",
        "Agost","Setembre","Octubre","Novembre","Desembre"
      ];
      monthLabel.textContent = `${names[month]} ${year}`;

      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const firstDay = new Date(year, month, 1).getDay();
      const offset = firstDay === 0 ? 6 : firstDay - 1;

      for (let i = 0; i < offset; i++) {
        const empty = document.createElement("div");
        empty.className = "day empty";
        calendar.appendChild(empty);
      }

      for (let d = 1; d <= daysInMonth; d++) {
        const el = document.createElement("div");
        el.className = "day";
        el.textContent = d;

        if (isDisabledDate(year, month, d)) {
          el.classList.add("disabled");
        } else {
          el.addEventListener("click", async () => {
            selectedDate = isoDate(year, month, d);
            document.querySelectorAll(".day").forEach((x) => x.classList.remove("selected"));
            el.classList.add("selected");
            if (selectedBuc) await renderSlots();
          });
        }

        calendar.appendChild(el);
      }
    }

    /* SELECT BUC */
    bucEls.forEach((el) => {
      el.addEventListener("click", async () => {
        bucEls.forEach((x) => x.classList.remove("selected"));
        el.classList.add("selected");
        selectedBuc = el.dataset.buc;
        if (selectedDate) await renderSlots();
      });
    });

    /* SLOTS */
    async function renderSlots() {
      slotsEl.innerHTML = "";
      startCell = endCell = null;
      selection.classList.add("hidden");
      if (!selectedBuc || !selectedDate) return;

      let reservedBackend = [];
      try {
        reservedBackend = await fetchAvailability(selectedBuc, selectedDate);
      } catch {
        reservedBackend = [];
      }

      const reservedLocal = getLocalReserved(selectedBuc, selectedDate);
      const reserved = mergeReserved(reservedBackend, reservedLocal);

      for (let i = 0; i < TIMES.length - 1; i++) {
        const el = document.createElement("div");
        el.textContent = `${TIMES[i]} – ${TIMES[i + 1]}`;
        el.className = "slot";

        const busyByBackend = reserved.includes(TIMES[i]);
        const busyByCart = cart.some(
          (c) => c.date === selectedDate && c.buc === selectedBuc && i >= c.startCell && i <= c.endCell
        );

        if (busyByBackend || busyByCart) {
          el.classList.add("busy");
        } else {
          el.addEventListener("click", () => selectStart(i, reserved));
        }

        slotsEl.appendChild(el);
      }

      updateCartText();
    }

    function selectStart(i, reserved) {
      startCell = i;
      endCell = i + MIN_CELLS - 1;
      updateSelection();

      const slotsEls = document.querySelectorAll(".slot");

      for (let j = startCell; j < startCell + MAX_CELLS && j < TIMES.length - 1; j++) {
        if (reserved.includes(TIMES[j])) break;

        slotsEls[j].onclick = () => {
          const newEnd = j;
          const length = newEnd - startCell + 1;
          const newHours = length / 2;
          const cDate = new Date(selectedDate);

          if (length >= MIN_CELLS && length <= MAX_CELLS) {
            if (totalHoursInMonth(cDate.getFullYear(), cDate.getMonth()) + newHours > MAX_HOURS_MONTH) {
              alert("No pots superar 10h en aquest mes.");
              return;
            }
            if (totalHoursInDay(selectedDate) + newHours > 3) {
              alert("No pots reservar més de 3h en aquest dia.");
              return;
            }
            endCell = newEnd;
            updateSelection();
          }
        };
      }
    }

    function updateSelection() {
      document.querySelectorAll(".slot").forEach((el, i) => {
        el.classList.remove("selected");
        if (startCell !== null && endCell !== null && i >= startCell && i <= endCell) {
          el.classList.add("selected");
        }
      });

      if (startCell !== null && endCell !== null) {
        const dur = (endCell - startCell + 1) / 2;
        rangeText.textContent = `Des de ${TIMES[startCell]} fins ${TIMES[endCell + 1]} (Durada: ${dur} h)`;
        selection.classList.remove("hidden");
      }
    }

    /* CART */
    addCartBtn.addEventListener("click", async () => {
      if (startCell === null || endCell === null) return;

      const dur = (endCell - startCell + 1) / 2;
      const cDate = new Date(selectedDate);

      if (totalHoursInDay(selectedDate) + dur > 3) {
        alert("No pots reservar més de 3h en aquest dia.");
        return;
      }
      if (totalHoursInMonth(cDate.getFullYear(), cDate.getMonth()) + dur > MAX_HOURS_MONTH) {
        alert("No pots superar 10h en aquest mes.");
        return;
      }

      cart.push({ buc: selectedBuc, date: selectedDate, startCell, endCell, dur });
      startCell = endCell = null;
      await renderSlots();
      selection.classList.add("hidden");
      updateCartText();
      checkout.classList.remove("hidden");
    });

    function updateCartText() {
      cartText.innerHTML = "";
      if (cart.length === 0) {
        cartText.textContent = "Carret buit";
        summary.classList.add("hidden");
        checkout.classList.add("hidden");
        return;
      }

      cart.forEach((c, index) => {
        const div = document.createElement("div");
        div.className = "cart-item";

        const txt = document.createElement("span");
        txt.className = "cart-item__text";
        txt.textContent = `Buc ${c.buc} - ${c.date} de ${TIMES[c.startCell]} a ${TIMES[c.endCell + 1]} (${c.dur} h)`;
        div.appendChild(txt);

        const btn = document.createElement("button");
        btn.className = "button button--danger button--small";
        btn.textContent = "Eliminar";
        btn.addEventListener("click", async () => {
          cart.splice(index, 1);
          await renderSlots();
          updateCartText();
        });
        div.appendChild(btn);

        cartText.appendChild(div);
      });

      const total = cart.reduce((sum, c) => sum + c.dur, 0);
      priceEl.textContent = `Preu total: ${total * PRICE_PER_HOUR} €`;
      durationEl.textContent = `Total hores seleccionades: ${total} h`;
      summary.classList.remove("hidden");
    }

    /* CONFIRM */
    confirmBtn.addEventListener("click", async () => {
      if (cart.length === 0) {
        alert("Carret buit!");
        return;
      }
      if (!nameInput.value.trim() || !emailInput.value.trim()) {
        alert("Omple nom i correu");
        return;
      }

      confirmBtn.disabled = true;
      const oldText = confirmBtn.textContent;
      confirmBtn.textContent = "Enviant...";

      const payload = {
        name: nameInput.value.trim(),
        email: emailInput.value.trim(),
        totalHours: cart.reduce((sum, c) => sum + c.dur, 0),
        totalPrice: totalPrice(),
        pricePerHour: PRICE_PER_HOUR,
        reservations: cart.map((c) => ({
          buc: c.buc,
          date: c.date,
          startTime: TIMES[c.startCell],
          endTime: TIMES[c.endCell + 1],
          duration: c.dur
        })),
        createdAt: new Date().toISOString()
      };

      // Revalidació disponibilitat abans d'enviar
      try {
        for (const c of cart) {
          const reservedNow = mergeReserved(
            await fetchAvailability(c.buc, c.date),
            getLocalReserved(c.buc, c.date)
          );
          for (let i = c.startCell; i <= c.endCell; i++) {
            if (reservedNow.includes(TIMES[i])) {
              alert(`Aquesta franja s'ha ocupat: Buc ${c.buc} el ${c.date} a les ${TIMES[i]}. Refresca i torna-ho a provar.`);
              confirmBtn.disabled = false;
              confirmBtn.textContent = oldText;
              await renderSlots();
              return;
            }
          }
        }
      } catch {
        // si availability no respon, deixem que el backend validi
      }

      const result = await submitReservation(payload);
      if (!result.ok) {
        alert(result.message || "No s'ha pogut enviar la reserva.");
        confirmBtn.disabled = false;
        confirmBtn.textContent = oldText;
        return;
      }

      // Bloqueig immediat a la web (fallback local + re-render)
      cart.forEach((c) => {
        const reserved = getLocalReserved(c.buc, c.date);
        for (let i = c.startCell; i <= c.endCell; i++) {
          reserved.push(TIMES[i]);
        }
        saveLocalReserved(c.buc, c.date, reserved);
      });

      alert("Reserva enviada. Revisa el teu correu per verificar-la.");

      cart = [];
      startCell = endCell = null;
      nameInput.value = "";
      emailInput.value = "";
      checkout.classList.add("hidden");

      confirmBtn.disabled = false;
      confirmBtn.textContent = oldText;

      await renderSlots();
      updateCartText();
    });

    /* NAV CALENDAR */
    document.getElementById("prev").addEventListener("click", () => {
      month--;
      if (month < 0) {
        month = 11;
        year--;
      }
      buildCalendar();
    });

    document.getElementById("next").addEventListener("click", () => {
      month++;
      if (month > 11) {
        month = 0;
        year++;
      }
      buildCalendar();
    });

    /* INIT */
    buildCalendar();
  });
})();
