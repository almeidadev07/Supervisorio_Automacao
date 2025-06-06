
function setupGauge(sliderId, gaugeId, textId, limiteId) {
  const slider = document.getElementById(sliderId);
  const gauge = document.getElementById(gaugeId);
  const valueText = document.getElementById(textId);
  const limiteText = document.getElementById(limiteId);
  slider.addEventListener("input", () => {
    const val = slider.value;
    valueText.textContent = `${val}%`;
    limiteText.textContent = `${val}%`;
    gauge.style.background = `conic-gradient(#00cc66 0% ${val}%, #eee ${val}% 100%)`;
  });
}
setupGauge("slider1", "gauge1", "gaugeVal1", "limite1");
document.addEventListener("DOMContentLoaded", function () {
  const buttons = document.querySelectorAll(".btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", function () {
      const type = btn.classList.contains("hand")
        ? "Jog Manual"
        : btn.classList.contains("power")
        ? "Ligar/Desligar"
        : btn.classList.contains("timer")
        ? "Timer"
        : "Outro";
      const unidade = btn.closest(".motor-unit")?.querySelector("h3")?.innerText || "Desconhecido";
      btn.classList.toggle("active");
      console.log(`[${unidade}] Botão "${type}" foi ${btn.classList.contains("active") ? 'ativado' : 'desativado'}`);
    });
  });
});
