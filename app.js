const form = document.querySelector("#booking-form");
const slots = Array.from(document.querySelectorAll(".slot"));
const summaryText = document.querySelector("#summary-text");
const summaryStatus = document.querySelector("#summary-status");

const updateSummary = () => {
  const data = new FormData(form);
  const service = data.get("service");
  const date = data.get("date");
  const slot = data.get("slot");
  const name = data.get("name");

  if (!service || !date || !slot) {
    summaryText.textContent = "Escull un servei i una hora per veure el resum.";
    summaryStatus.textContent = "Pendents de confirmar";
    summaryStatus.classList.remove("is-ready");
    return;
  }

  const dateLabel = new Date(date).toLocaleDateString("ca-ES", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  const nameLabel = name ? ` per ${name}` : "";

  summaryText.textContent = `${service} · ${dateLabel} a les ${slot}${nameLabel}.`;
  summaryStatus.textContent = "Llista per confirmar";
  summaryStatus.classList.add("is-ready");
};

slots.forEach((slotButton) => {
  slotButton.addEventListener("click", () => {
    slots.forEach((button) => button.classList.remove("is-active"));
    slotButton.classList.add("is-active");
    form.elements.slot.value = slotButton.dataset.slot;
    updateSummary();
  });
});

form.addEventListener("input", updateSummary);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  updateSummary();

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  summaryStatus.textContent = "Reserva confirmada";
  summaryStatus.classList.add("is-ready");
  summaryText.textContent = "Reserva confirmada! Rebràs un correu de confirmació en uns minuts.";
  form.reset();
  slots.forEach((button) => button.classList.remove("is-active"));
});
