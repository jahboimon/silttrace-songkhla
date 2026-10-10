const zoneColors = { A: "#0b8a91", B: "#bf7c43", C: "#4b9d6b" };
const zoneDistance = { A: "0–4 km", B: "4–8 km", C: "> 8 km" };
const dateOrder = ["20250331", "20251002", "20251201"];
let selectedDate = "20251201";
let selectedLayer = "ndti";
let rasterOverlay;
let chart;
let data;
let selectedStation = "ONE037";
let stationLayer;
const stationMarkers = new Map();

const map = L.map("map", { zoomControl: false, attributionControl: true });
L.control.zoom({ position: "topright" }).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  opacity: 0.55,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

const legends = {
  truecolor: `<div class="legend-title">ภาพสีจริง Sentinel-2</div><div class="legend-row">RGB: B4 · B3 · B2</div>`,
  ndti: `<div class="legend-title">ความขุ่นเชิงสัมพัทธ์ (NDTI)</div><div class="gradient"></div><div class="legend-labels"><span>−0.35 ต่ำ</span><span>0</span><span>+0.15 สูง</span></div>`,
  uwqv: `<div class="legend-title">UWQV · การแสดงผลเชิงคุณภาพ</div><div class="legend-row"><i class="swatch" style="background:linear-gradient(90deg,#01042a,#006a4e,#7cfa00,#f1d71b,#f00)"></i>สัญญาณ MCI</div><div class="legend-row"><i class="swatch" style="background:linear-gradient(90deg,#f5deb3,#654321)"></i>สัญญาณตะกอน</div>`,
};

function rowsForDate(date) {
  return data.zonal.filter((row) => String(row.date) === date).sort((a, b) => a.zone.localeCompare(b.zone));
}

function formatIndex(value) {
  const number = Number(value);
  return `${number >= 0 ? "+" : ""}${number.toFixed(3)}`;
}

function formatMetric(value, digits = 1) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : null;
}

function hydroRow() {
  return data.hydro.find((row) => String(row.acquisition_date).replaceAll("-", "") === selectedDate && row.station_code === selectedStation);
}

function metricCard(label, value, unit, coverage) {
  const display = formatMetric(value);
  const complete = display !== null;
  return `<article class="hydro-metric ${complete ? "" : "missing"}">
    <span>${label}</span>
    <strong>${complete ? display : "ข้อมูลไม่ครบ"}</strong>
    <small>${complete ? unit : `coverage ${formatMetric(coverage, 0) ?? 0}%`}</small>
  </article>`;
}

function updateHydro() {
  const row = hydroRow();
  if (!row) return;
  document.getElementById("hydro-metrics").innerHTML = [
    metricCard("ฝนสะสม 1 วัน", row.rainfall_1d_mm, "mm", row.rainfall_1d_coverage_pct),
    metricCard("ฝนสะสม 3 วัน", row.rainfall_3d_mm, "mm", row.rainfall_3d_coverage_pct),
    metricCard("ฝนสะสม 7 วัน", row.rainfall_7d_mm, "mm", row.rainfall_7d_coverage_pct),
    metricCard("ระดับน้ำมัธยฐาน", row.water_level_median, "m", row.water_level_coverage_pct),
  ].join("");
  const incompleteRain = [row.rainfall_3d_mm, row.rainfall_7d_mm].some((v) => formatMetric(v) === null);
  const waterCoverage = Number(row.water_level_coverage_pct);
  let note = `ข้อมูล ณ ${data.dates[selectedDate].label}`;
  if (incompleteRain) note += " · ช่วงฝนสะสมก่อนวันถ่ายภาพยังครอบคลุมไม่ครบ";
  if (formatMetric(row.water_level_median) === null) note += " · ไม่มีข้อมูลระดับน้ำในวันดังกล่าว";
  else if (waterCoverage < 90) note += ` · ระดับน้ำมี coverage ${waterCoverage.toFixed(0)}%`;
  document.getElementById("hydro-note").textContent = note;

  stationMarkers.forEach((marker, code) => {
    marker.getElement()?.classList.toggle("selected", code === selectedStation);
  });
}

function updateRaster() {
  if (rasterOverlay) map.removeLayer(rasterOverlay);
  rasterOverlay = L.imageOverlay(data.layers[selectedDate][selectedLayer], data.bounds, {
    opacity: selectedLayer === "truecolor" ? 1 : 0.92,
    interactive: false,
  }).addTo(map);
  rasterOverlay.bringToBack();
  document.getElementById("legend").innerHTML = legends[selectedLayer];
}

function updateSummary() {
  const meta = data.dates[selectedDate];
  document.getElementById("selected-date").textContent = meta.label;
  document.getElementById("selected-stage").textContent = meta.stage;

  const rows = rowsForDate(selectedDate);
  document.getElementById("zone-cards").innerHTML = rows.map((row) => `
    <article class="zone-card" style="--zone-color:${zoneColors[row.zone]}">
      <p>ZONE ${row.zone}</p>
      <strong>${formatIndex(row.median)}</strong>
      <span>${zoneDistance[row.zone]}</span>
    </article>
  `).join("");

  const medians = Object.fromEntries(rows.map((row) => [row.zone, Number(row.median)]));
  if (selectedDate === "20251201") {
    document.getElementById("insight-text").textContent = `หลังอุทกภัย Zone A มี NDTI สูงสุด (${formatIndex(medians.A)}) และลดลงผ่าน Zone B ไปยัง Zone C สอดคล้องกับแนวโน้มการกระจายจากปากคลอง`;
  } else if (selectedDate === "20251002") {
    document.getElementById("insight-text").textContent = "ช่วงฤดูฝนมีค่ามัธยฐาน NDTI ต่ำในทั้งสามโซน โดยส่วนที่มีเมฆและพิกเซลคุณภาพต่ำถูกตัดออกก่อนการเปรียบเทียบ";
  } else {
    document.getElementById("insight-text").textContent = "ช่วงฤดูแล้งค่ามัธยฐานของทั้งสามโซนอยู่ใกล้กัน และยังไม่พบรูปแบบลดหลั่นตามระยะห่างจากปากคลองอย่างเด่นชัด";
  }
  updateHydro();
}

function updateButtons() {
  document.querySelectorAll("#date-switcher button").forEach((button) => {
    button.classList.toggle("active", button.dataset.date === selectedDate);
  });
  document.querySelectorAll("#layer-switcher button").forEach((button) => {
    button.classList.toggle("active", button.dataset.layer === selectedLayer);
  });
}

function createChart() {
  const datasets = ["A", "B", "C"].map((zone) => ({
    label: `Zone ${zone}`,
    data: dateOrder.map((date) => Number(data.zonal.find((row) => String(row.date) === date && row.zone === zone).median)),
    borderColor: zoneColors[zone],
    backgroundColor: zoneColors[zone],
    borderWidth: 2.2,
    pointRadius: 4,
    pointHoverRadius: 6,
    tension: 0.22,
  }));

  chart = new Chart(document.getElementById("trend-chart"), {
    type: "line",
    data: { labels: dateOrder.map((date) => data.dates[date].label), datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 7, font: { size: 10 } } },
        tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${formatIndex(context.raw)}` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 9 } } },
        y: { suggestedMin: -0.35, suggestedMax: 0.08, grid: { color: "#e6ecef" }, ticks: { font: { size: 9 } } },
      },
    },
  });
}

async function addVectors() {
  const [zones, outlet, stations] = await Promise.all([
    fetch("assets/data/zones.geojson").then((response) => response.json()),
    fetch("assets/data/outlet.geojson").then((response) => response.json()),
    fetch("assets/data/stations.geojson").then((response) => response.json()),
  ]);

  L.geoJSON(zones, {
    style: (feature) => ({
      color: zoneColors[feature.properties.zone],
      weight: 2.2,
      opacity: 0.95,
      fillColor: zoneColors[feature.properties.zone],
      fillOpacity: 0.025,
    }),
    onEachFeature: (feature, layer) => {
      const p = feature.properties;
      layer.bindTooltip(`<strong>Zone ${p.zone}</strong><br>${p.distance}<br>${Number(p.polygon_km2).toFixed(1)} km²`, { sticky: true });
    },
  }).addTo(map);

  L.geoJSON(outlet, {
    pointToLayer: (_, latlng) => L.marker(latlng, {
      icon: L.divIcon({ className: "outlet-marker", html: "◎", iconAnchor: [14, 14] }),
    }),
  }).bindTooltip("ปากคลองอู่ตะเภา", { direction: "top", offset: [0, -12] }).addTo(map);

  stationLayer = L.geoJSON(stations, {
    pointToLayer: (feature, latlng) => {
      const code = feature.properties.station_code;
      const marker = L.marker(latlng, {
        icon: L.divIcon({ className: `station-marker ${code === selectedStation ? "selected" : ""}`, html: code.slice(-2), iconAnchor: [12, 12] }),
      });
      stationMarkers.set(code, marker);
      return marker;
    },
    onEachFeature: (feature, layer) => {
      const p = feature.properties;
      layer.bindTooltip(`<strong>${p.station_code}</strong><br>${p.station_name}`, { direction: "top", offset: [0, -10] });
      layer.on("click", () => {
        selectedStation = p.station_code;
        document.getElementById("station-select").value = selectedStation;
        updateHydro();
      });
    },
  }).addTo(map);
}

async function init() {
  data = await fetch("assets/data/dashboard.json").then((response) => response.json());
  map.fitBounds(data.bounds, { padding: [18, 18] });

  document.getElementById("date-switcher").innerHTML = dateOrder.map((date) => `
    <button data-date="${date}"><strong>${data.dates[date].label}</strong><span>${data.dates[date].stage}</span></button>
  `).join("");
  const stations = [...new Map(data.hydro.map((row) => [row.station_code, row.station_name])).entries()];
  document.getElementById("station-select").innerHTML = stations.map(([code, name]) => `<option value="${code}">${code} · ${name}</option>`).join("");
  document.getElementById("station-select").value = selectedStation;
  document.getElementById("station-select").addEventListener("change", (event) => {
    selectedStation = event.target.value;
    updateHydro();
  });
  document.getElementById("station-toggle").addEventListener("click", (event) => {
    const button = event.currentTarget;
    const visible = map.hasLayer(stationLayer);
    if (visible) map.removeLayer(stationLayer); else stationLayer.addTo(map);
    button.classList.toggle("active", !visible);
  });

  document.getElementById("date-switcher").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-date]");
    if (!button) return;
    selectedDate = button.dataset.date;
    updateButtons(); updateRaster(); updateSummary();
  });
  document.getElementById("layer-switcher").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-layer]");
    if (!button) return;
    selectedLayer = button.dataset.layer;
    updateButtons(); updateRaster();
  });

  updateButtons();
  updateRaster();
  updateSummary();
  createChart();
  await addVectors();
}

init().catch((error) => {
  console.error(error);
  document.getElementById("insight-text").textContent = "ไม่สามารถโหลดข้อมูลได้ กรุณาเปิดเว็บผ่าน local server";
});
