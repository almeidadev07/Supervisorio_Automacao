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
setupGauge("slider2", "gauge2", "gaugeVal2", "limite2");