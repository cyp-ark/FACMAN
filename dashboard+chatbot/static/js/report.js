// report.js

function updateClock() {
  const now = new Date();
  document.getElementById("clock").textContent = now.toLocaleString("ko-KR", {
    hour12: false,
  });
}
setInterval(updateClock, 1000);
updateClock();

let gaugeChart;

function drawCharts(labels, available, failures) {
  const gaugeCtx = document.getElementById("gaugeChart").getContext("2d");
  const avgAvailability = Math.round(
    (available.reduce((a, b) => a + b, 0) / available.length) * 100
  );

  if (gaugeChart) gaugeChart.destroy();

  gaugeChart = new Chart(gaugeCtx, {
    type: "doughnut",
    data: {
      labels: ["가동률", "비가동률"],
      datasets: [
        {
          data: [avgAvailability, 100 - avgAvailability],
          backgroundColor: ["green", "#e0e0e0"],
        },
      ],
    },
    options: {
      responsive: false,
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: { font: { size: 12 } },
        },
      },
      cutout: "50%",
    },
  });

  // ✅ 시간대별 고장수 집계
  const hourMap = {};
  labels.forEach((label, i) => {
    const hour = label.substring(0, 2) + ":00";
    if (!hourMap[hour]) hourMap[hour] = 0;
    hourMap[hour] += failures[i];
  });

  const hourlyLabels = Object.keys(hourMap);
  const hourlyFailures = Object.values(hourMap);

  const tableBody = document.querySelector("#failureTable tbody");
  tableBody.innerHTML = "";
  hourlyLabels.forEach((hour, idx) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${hour}</td><td>${hourlyFailures[idx]}</td>`;
    tableBody.appendChild(row);
  });
  document.getElementById("failureTable").style.display = "table";

  // ✅ 이미지 저장
  setTimeout(() => {
    document.getElementById("availabilityImage").src =
      gaugeChart.toBase64Image();
  }, 500);
}

function generateReport() {
  document.getElementById("reportBox").textContent = "보고서를 생성 중입니다...";
  document.getElementById("failureTable").style.display = "none";

  const process = document.getElementById("process").value;
  const range = document.getElementById("range").value;

  fetch("/generate_report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ process, range }),
  })
    .then((res) => res.json())
    .then((data) => {
      document.getElementById("reportBox").textContent =
        data.report || data.error;
      drawCharts(data.labels, data.available, data.failures);
    });
}

function downloadDocx() {
  const reportText = document.getElementById("reportBox").textContent;
  const availabilityImage = document.getElementById("availabilityImage").src;

  fetch("/generate_docx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ report: reportText, availabilityImage }),
  })
    .then((response) => {
      if (!response.ok) throw new Error("파일 생성 실패");
      return response.blob();
    })
    .then((blob) => {
      const link = document.createElement("a");
      link.href = window.URL.createObjectURL(blob);
      link.download = "제조_보고서.docx";
      document.body.appendChild(link);
      link.click();
      link.remove();
    })
    .catch((err) => alert("다운로드 오류: " + err.message));
}