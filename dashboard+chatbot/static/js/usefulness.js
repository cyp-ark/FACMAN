// ✅ 유용성 도넛 차트 생성
function updateUsefulnessCharts(labels, availability) {
  const chartCtx = document.getElementById("usefulnessChart").getContext("2d");
  const avgAvailability = Math.round(
    (availability.reduce((a, b) => a + b, 0) / availability.length) * 100
  );

  new Chart(chartCtx, {
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
      responsive: true,
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
}

// ✅ 서버 상태 박스 색상/텍스트 갱신
function updateServerStatus(status) {
  const statusBox = document.getElementById("P1-A_status");
  const statusText = document.getElementById("serverStatusText");

  const statusMap = {
    "processing": "#4CAF50",
    "repair": "orange",
    "failure": "red",
    "maintenance": "yellow",
  };

  if (statusBox) {
    statusBox.style.backgroundColor = statusMap[status] || "#444";
  }

  if (statusText) {
    statusText.textContent = status;
  }
}

// ✅ 서버에서 유용성 데이터 요청
function fetchUsefulnessData() {
  const process = "P1-A";
  const range = "1d";

  fetch("/get_usefulness_data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ process, range }),
  })
    .then((res) => res.json())
    .then((data) => {
      updateUsefulnessCharts(data.labels, data.availability);
      updateServerStatus(data.serverStatus);
    })
    .catch((err) => console.error("유용성 데이터 가져오기 실패:", err));
}

// ✅ 시계 갱신
function updateClock() {
  const now = new Date();
  const clockEl = document.getElementById("clock");
  if (clockEl) {
    clockEl.textContent = now.toLocaleString("ko-KR", { hour12: false });
  }
}

// ✅ 챗봇 메시지 전송
function sendLangGraphMessage() {
  const input = document.getElementById("chatInput");
  const history = document.getElementById("chatHistory");
  const message = input.value.trim();
  if (!message) return;

  const userMsg = document.createElement("div");
  userMsg.className = "chat-box";
  userMsg.innerHTML = `<div class="chat-message user">${message}</div>`;
  history.appendChild(userMsg);

  input.value = "";

  const botMsg = document.createElement("div");
  botMsg.className = "chat-box";
  botMsg.innerHTML = `<div class="chat-message bot">⏳ 답변을 불러오는 중입니다...</div>`;
  history.appendChild(botMsg);

  fetch("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  })
    .then((res) => res.json())
    .then((data) => {
      botMsg.innerHTML = `<div class="chat-message bot">${data.reply}</div>`;
    })
    .catch((err) => {
      botMsg.innerHTML = `<div class="chat-message bot">❌ 서버 오류</div>`;
      console.error(err);
    });
}

// ✅ 챗봇 버튼 및 이벤트 연결
function setupChatbot() {
  const sendBtn = document.getElementById("chatSendBtn");
  const clearBtn = document.getElementById("chatClearBtn");
  const input = document.getElementById("chatInput");
  const history = document.getElementById("chatHistory");

  if (sendBtn) sendBtn.addEventListener("click", sendLangGraphMessage);
  if (clearBtn) clearBtn.addEventListener("click", () => {
    history.innerHTML = "";
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendLangGraphMessage();
    }
  });
}

// ✅ 페이지 로드 시 실행
window.onload = function () {
  fetchUsefulnessData();
  updateClock();
  setInterval(updateClock, 1000);
  setupChatbot();

  // ✅ SocketIO 연결 및 서버 상태 수신 (필수 추가!)
  const socket = io();

  socket.on('connect', () => {
    console.log('SocketIO 서버 연결됨.');
  });

  socket.on('status_update', (data) => {
    if (data["P1-A"]) {
      const status = data["P1-A"].event_type;
      updateServerStatus(status);
    }
  });
};

