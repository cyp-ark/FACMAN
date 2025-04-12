let gaugeCharts = {};
let lineCharts = {};
let fullReportData = [];

function updateClock() {
  const now = new Date();
  document.getElementById("clock").textContent = now.toLocaleString("ko-KR", { hour12: false });
}
setInterval(updateClock, 1000);
updateClock();

document.addEventListener("DOMContentLoaded", () => {
  const periodType = document.getElementById("periodType");
  const rangeSelect = document.getElementById("range");
  const startTime = document.getElementById("startTime");
  const endTime = document.getElementById("endTime");

  periodType?.addEventListener("change", function () {
    if (this.value === "daily") {
      rangeSelect.disabled = false;
      // ✅ 1일/7일/31일 옵션은 숨김 처리
      Array.from(rangeSelect.options).forEach(opt => {
        if (["1일", "7일", "31일"].includes(opt.text)) opt.style.display = "none";
        else opt.style.display = "";
      });
    } else {
      rangeSelect.disabled = true;
      startTime.style.display = "none";
      endTime.style.display = "none";
    }
  });

  rangeSelect?.addEventListener("change", function () {
    const isCustom = this.value === "custom";
    startTime.style.display = isCustom ? "inline-block" : "none";
    endTime.style.display = isCustom ? "inline-block" : "none";
  });
});

// ✅ 보고서 생성
function generateReport() {
  const reportBox = document.getElementById("reportBox");
  reportBox.textContent = "📄 보고서 생성 중...";

  const checkboxes = document.querySelectorAll("#processCheckboxes input:checked");
  const processes = Array.from(checkboxes).map(cb => cb.value);
  const rangeValue = document.getElementById("range")?.value;
  const periodType = document.getElementById("periodType")?.value;
  const startTime = document.getElementById("startTime")?.value;
  const endTime = document.getElementById("endTime")?.value;

  if (processes.length === 0) {
    alert("✅ 공정을 선택하세요.");
    return;
  }

  const includeOptions = {
    availability: !!document.getElementById("includeAvailability")?.checked,
    production: !!document.getElementById("includeProduction")?.checked,
    downtime: !!document.getElementById("includeDowntime")?.checked,
    failureCount: !!document.getElementById("includeFailureCount")?.checked,
    mtbf: !!document.getElementById("includeMTBF")?.checked,
    mttr: !!document.getElementById("includeMTTR")?.checked
    };

  const rangeMap = {
    "1시간": "1h",
    "3시간": "3h",
    "6시간": "6h",
    "9시간": "9h"
  };

  let rangeParam = "";

  if (periodType === "weekly") {
    rangeParam = "7d";
  } else if (periodType === "monthly") {
    rangeParam = "31d";
  } else {
    if (rangeValue === "custom") {
      if (!startTime || !endTime) {
        alert("⛔ 시작 시간과 종료 시간을 모두 입력하세요.");
        return;
      }
      const formattedStart = startTime.length === 16 ? startTime + ":00+09:00" : startTime;
      const formattedEnd = endTime.length === 16 ? endTime + ":00+09:00" : endTime;
      rangeParam = `${formattedStart}/${formattedEnd}`;
    } else {
      rangeParam = rangeMap[rangeValue] || "1h";
    }
  }

  fetch("/generate_report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ processes, range: rangeParam, options: includeOptions }),
  })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        reportBox.textContent = "❌ " + data.error;
        return;
      }
      data.reports = data.reports.map(rep => ({
        ...rep,
        range: rangeParam
      }));

      let resultText = "✅ 보고서 생성 완료\n";
      const tabs = document.getElementById("tabs");       // ✅ 탭 컨테이너
      const chartsArea = document.getElementById("chartsArea");  // ✅ 실제 내용 보여줄 영역
      tabs.innerHTML = "";
      chartsArea.innerHTML = "";
    
      fullReportData = data.reports;
        // ✅ 1. 여기서 탭을 생성
      data.reports.forEach((rep, idx) => {
        const tabBtn = document.createElement("div");
        tabBtn.className = "tab";
        tabBtn.textContent = rep.process;
        if (idx === 0) tabBtn.classList.add("active");
        tabBtn.dataset.target = `tab-${rep.process}`;
        tabs.appendChild(tabBtn);

        tabBtn.addEventListener("click", () => {
          document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
          document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
          tabBtn.classList.add("active");
          document.getElementById(`tab-${rep.process}`).classList.add("active");
        });
      });
      // ✅ 2. 여기서 각 공정별 콘텐츠 div를 만들고 기존 append → chartsArea → content 로 바꿈
      data.reports.forEach((rep, idx) => {
        resultText += `\n\n📌 [${rep.process}] 공정\n${rep.report}\n`;

        const content = document.createElement("div");
        content.className = "tab-content";
        content.id = `tab-${rep.process}`;

        const periodInfo = document.createElement("p");
        periodInfo.textContent = `📅 분석 기간: ${rep.range || ''}`;
        periodInfo.style.fontSize = "13px";
        periodInfo.style.marginBottom = "8px";
        content.appendChild(periodInfo);

        if (idx === 0) content.classList.add("active");
        chartsArea.appendChild(content);

        // 1. 가동률
        if (includeOptions.availability && rep.available) {
          const availContainer = document.createElement("div");
          availContainer.innerHTML = `<h4 class="report-subtitle">📈 가동률</h4>`;
          
          const gaugeCanvas = document.createElement("canvas");
          gaugeCanvas.width = 200;
          gaugeCanvas.height = 200;
          gaugeCanvas.id = `availabilityImage-${rep.process}`;
          availContainer.appendChild(gaugeCanvas);     
          content.appendChild(availContainer);         
        
          drawGaugeChart(gaugeCanvas, rep.available, rep.process);
        }

        // 2. 생산실적
        if (includeOptions.production && rep.production) {
          const prodBox = document.createElement("div");
          prodBox.innerHTML = `
            <h4 class="report-subtitle">📦 생산실적</h4>
            <p>투입량(P0): ${rep.production.input}개</p>
            <p>생산량(P3): ${rep.production.output}개</p>
            <p>생산실적률: ${rep.production.rate}%</p>
          `;
          content.appendChild(prodBox);
        }

        // 3. 다운타임
        if (includeOptions.downtime) {
          fetch("/get_downtime_data", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ process: rep.process, range: rangeParam })
          })
            .then(res => res.json())
            .then(downtime => {
              const downtimeWrapper = document.createElement("div");
              downtimeWrapper.innerHTML = `<h4 class="report-subtitle">📉 다운타임 분석</h4>`;

              const pieCanvas = document.createElement("canvas");
              pieCanvas.id = `downtimePie-${rep.process}`;
              pieCanvas.style.width = "300px";
              pieCanvas.style.height = "200px";

              const barCanvas = document.createElement("canvas");
              barCanvas.id = `downtimeBar-${rep.process}`;
              barCanvas.style.width = "300px";
              barCanvas.style.height = "200px";

              const downtimeContainer = document.createElement("div");
              downtimeContainer.className = "downtime-chart-group";
              downtimeContainer.style.display = "flex";
              downtimeContainer.style.justifyContent = "flex-start";  // 왼쪽 정렬
              downtimeContainer.style.alignItems = "center";          // 높이 맞춤
              downtimeContainer.style.gap = "20px";
              downtimeContainer.style.marginBottom = "40px";

              downtimeContainer.appendChild(pieCanvas);
              downtimeContainer.appendChild(barCanvas);
              downtimeWrapper.appendChild(downtimeContainer);  
              content.appendChild(downtimeWrapper);     

              drawDowntimePieChart(pieCanvas, downtime.failure_total, rep.total_processing_minutes);
              drawDowntimeBarChart(barCanvas, downtime.hourly_labels, downtime.failure_by_hour, downtime.repair_by_hour);
            });
        }
        
        // 4. 고장 건수
        if (includeOptions.failureCount && rep.failures) {
          const startHour = startTime ? parseInt(startTime.substring(11, 13)) : 0;
          const endHour = endTime ? parseInt(endTime.substring(11, 13)) : 23;

          const hourMap = {};
          rep.labels.forEach((label, i) => {
            if (!label || label.length < 2) return;
            const hour = parseInt(label.substring(0, 2));
            if (hour < startHour || hour > endHour) return;

            const hourKey = `${hour.toString().padStart(2, "0")}시대`;
            if (!hourMap[hourKey]) hourMap[hourKey] = 0;
            hourMap[hourKey] += rep.failures[i];
          });

          const hourlyLabels = Object.keys(hourMap);
          const hourlyFailures = Object.values(hourMap);

          const failureWrapper = document.createElement("div");
          failureWrapper.innerHTML = `<h4 class="report-subtitle">📊 고장 발생 분포</h4>`;

          const rowContainer = document.createElement("div");
          rowContainer.className = "report-row-container";

          const lineCanvas = document.createElement("canvas");
          lineCanvas.width = 400;
          lineCanvas.height = 300;
          lineCanvas.id = `failureLineChart-${rep.process}`;
          rowContainer.appendChild(lineCanvas);

          const tableWrapper = document.createElement("div");
          tableWrapper.style.display = "grid";
          tableWrapper.style.gridTemplateColumns = "120px 120px";
          tableWrapper.style.gap = "6px";
          tableWrapper.style.alignContent = "start";

          hourlyLabels.forEach((label, i) => {
            const cell = document.createElement("div");
            cell.style.border = "1px solid #999";
            cell.style.padding = "6px";
            cell.textContent = `${label}: ${hourlyFailures[i]}건`;
            tableWrapper.appendChild(cell);
          });

          rowContainer.appendChild(tableWrapper);
          failureWrapper.appendChild(rowContainer);  // ✅ wrapper에 rowContainer 삽입
          content.appendChild(failureWrapper);       

          drawLineChart(lineCanvas, hourlyLabels, hourlyFailures, rep.process);
        }

        // 5. MTBF  
        if (includeOptions.mtbf) {
          fetch("/get_mtbf_data", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ process: rep.process, range: rangeParam })
          })
            .then(res => res.json())
            .then(mtbfData => {
              const mtbfContainer = document.createElement("div");
              mtbfContainer.innerHTML = `<h4 class="report-subtitle">🔁 MTBF(고장 구간 사이 평균시간)</h4>`;
        
              const infoBox = document.createElement("div");
              infoBox.style.marginBottom = "20px";
              infoBox.innerHTML = `
                <p style="font-size:28px; font-weight:bold;">${mtbfData.mtbf_minutes}분</p>
                <p><strong>총 가동 시간:</strong> ${mtbfData.total_processing_minutes}분</p>
                <p><strong>고장 횟수:</strong> ${mtbfData.failure_count}회</p>
              `;
        
              mtbfContainer.appendChild(infoBox);
              content.appendChild(mtbfContainer);
            });
        }

        // 6. MTTR
        if (includeOptions.mttr) {
          fetch("/get_mttr_data", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ process: rep.process, range: rangeParam })
          })
            .then(res => res.json())
            .then(mttrData => {
              const mttrContainer = document.createElement("div");
              mttrContainer.innerHTML = `<h4 class="report-subtitle">🔧 MTTR(복구에 걸리는 평균 시간)</h4>`;
        
              const infoBox = document.createElement("div");
              infoBox.style.marginBottom = "20px";
              infoBox.innerHTML = `
                <p style="font-size:28px; font-weight:bold;">${mttrData.mttr_minutes}분</p>
                <p>고장 ${mttrData.repair_count}회<br>총 수리 시간 ${mttrData.total_repair_minutes}분</p>
              `;
        
              mttrContainer.appendChild(infoBox);
              content.appendChild(mttrContainer);
            });
        }
      });

      reportBox.innerHTML = `<pre>${resultText}</pre>`;
    })
    .catch(err => {
      reportBox.textContent = "❌ 보고서 생성 실패";
      console.error("Error while generating report:", err);
    });
}


function drawGaugeChart(canvas, availableArray, processName) {
  const ctx = canvas.getContext("2d");
  const avg = Math.round((availableArray.reduce((a, b) => a + b, 0) / availableArray.length) * 100);
  new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["가동률", "비가동률"],
      datasets: [{
        data: [avg, 100 - avg],
        backgroundColor: ["green", "#e0e0e0"]
      }]
    },
    options: {
      responsive: false,
      plugins: {
        legend: { display: true, position: "bottom" }
      },
      cutout: "50%"
    }
  });
}

function drawLineChart(canvas, labels, counts, processName) {
  const ctx = canvas.getContext("2d");
  new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: `${processName} 고장 수`,
        data: counts,
        borderColor: "red",
        backgroundColor: "rgba(255,0,0,0.1)",
        tension: 0.3,
        fill: true
      }]
    },
    options: {
      responsive: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1,
            callback: value => value + "건"
          }
        }
      }
    }
  });
}

function drawDowntimePieChart(canvas, failure) {
  const total = failure > 0 ? failure : 1;  
  new Chart(canvas.getContext("2d"), {
    type: "pie",
    data: {
      labels: ["고장 다운타임", "기타"],
      datasets: [{
        data: [failure, total - failure],
        backgroundColor: ["#ff6666", "#66ccff"]
      }]
    },
    options: {
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: "다운타임 유형별 비율"
        },
        legend: { position: "bottom" }
      }
    }
  });
}

function drawDowntimeBarChart(canvas, labels, failureData, repairData) {
  new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "고장",
          data: failureData,
          backgroundColor: "rgba(255, 99, 132, 0.7)"
        },
        {
          label: "수리",
          data: repairData,
          backgroundColor: "rgba(54, 162, 235, 0.7)"
        }
      ]
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: "시간대별 다운타임 분포"
        }
      },
      responsive: false,
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: "다운타임 (분)"
          }
        }
      }
    }
  });
}

function drawMTBFPieChart(canvas, mtbf, total) {
  new Chart(canvas.getContext("2d"), {
    type: "pie",
    data: {
      labels: ["MTBF", "기타 운영시간"],
      datasets: [{
        data: [mtbf, total - mtbf],
        backgroundColor: ["#28a745", "#dddddd"]
      }]
    },
    options: {
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: "MTBF"
        },
        legend: {
          position: "bottom"
        }
      }
    }
  });
}

function drawMTTRPieChart(canvas, mttr, totalRepair) {
  new Chart(canvas.getContext("2d"), {
    type: "pie",
    data: {
      labels: ["MTTR", "기타 수리시간"],
      datasets: [{
        data: [mttr, totalRepair - mttr],
        backgroundColor: ["#ffa500", "#ddd"]
      }]
    },
    options: {
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: "MTTR 시각화"
        },
        legend: {
          position: "bottom"
        }
      }
    }
  });
}
async function waitForCanvasRendered(canvasId, timeout = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const canvas = document.getElementById(canvasId);
    if (canvas && canvas.getContext("2d").__chart__) return canvas; // Chart.js 객체 생성 확인
    await new Promise(res => setTimeout(res, 100));
  }
  return null;
}

// ✅ Docx 파일 다운로드
async function downloadDocx() {
  if (!fullReportData || fullReportData.length === 0) {
    alert("⚠️ 먼저 보고서를 생성하세요.");
    return;
  }

  const formData = new FormData();

  // 1. 전체 요약 텍스트 생성
  let combinedReport = "";
  let combinedFailureLabels = [];
  let combinedFailureCounts = [];

  for (let rep of fullReportData) {
    combinedReport += `\n\n📌 [${rep.process}] 공정\n📅 분석 기간: ${rep.range}\n${rep.report}\n`;


    if (rep.failureLabels && rep.failureCounts) {
      combinedFailureLabels = combinedFailureLabels.concat(rep.failureLabels);
      combinedFailureCounts = combinedFailureCounts.concat(rep.failureCounts);
    }
  }

  // 2. 데이터 추가 (텍스트, 고장 테이블, 전체 reportData)
  formData.append("report", combinedReport);
  formData.append("failureLabels", JSON.stringify(combinedFailureLabels));
  formData.append("failureCounts", JSON.stringify(combinedFailureCounts));
  formData.append("reportData", JSON.stringify(fullReportData));  

  // 3. 서버로 전송
  const res = await fetch("/generate_docx", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    alert("❌ 보고서 다운로드 실패");
    return;
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "제조_보고서.docx";
  link.click();
  window.URL.revokeObjectURL(url);
}

// ✅ 엑셀 다운로드 요청
async function downloadExcel() {
  console.log("📥 엑셀 다운로드 버튼 클릭됨");
  if (!fullReportData || fullReportData.length === 0) {
    alert("⚠️ 먼저 보고서를 생성하세요.");
    return;
  }

  const formData = new FormData();
  formData.append("reportData", JSON.stringify(fullReportData));
  console.log("📤 전송할 데이터", fullReportData);

  try {
    const res = await fetch("/generate_excel", {
      method: "POST",
      body: formData,
    });

    console.log("📩 서버 응답", res);

    if (!res.ok) {
      alert("❌ 엑셀 파일 다운로드 실패");
      return;
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "제조_기초데이터.xlsx";
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    alert("❌ 다운로드 중 오류가 발생했습니다.");
    console.error("Excel download error:", error);
  }
}
