// ✅ 챗봇 메시지 전송 함수
async function sendLangGraphMessage() {
  const textarea = document.getElementById("chatInput");
  const message = textarea.value.trim();
  if (!message) return;

  const history = document.getElementById("chatHistory");

  // ✅ 사용자 질문 박스 생성
  const userBox = document.createElement("div");
  userBox.className = "chat-box";
  const userMsg = document.createElement("div");
  userMsg.className = "chat-message user";
  userMsg.textContent = message;
  userBox.appendChild(userMsg);
  history.appendChild(userBox);

  // ✅ 챗봇 응답 박스 생성 (로딩 중)
  const botBox = document.createElement("div");
  botBox.className = "chat-box";
  const botMsg = document.createElement("div");
  botMsg.className = "chat-message bot";
  botMsg.textContent = "⏳ 답변 생성 중입니다...";
  botBox.appendChild(botMsg);
  history.appendChild(botBox);

  // ✅ 스크롤 아래로
  history.scrollTop = history.scrollHeight;
  textarea.value = "";

  try {
    const res = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });

    const data = await res.json();
    botMsg.textContent = data.reply;
  } catch (err) {
    botMsg.textContent = "❌ 서버 연결 실패";
    console.error(err);
  }

  history.scrollTop = history.scrollHeight;
}

// ✅ 채팅 기록 초기화 함수
function clearChatHistory() {
  const chatHistory = document.getElementById("chatHistory");
  chatHistory.innerHTML = ""; // 모든 자식 요소 삭제
}

// ✅ 이벤트 바인딩
document.addEventListener("DOMContentLoaded", () => {
  const sendBtn = document.getElementById("chatSendBtn");
  const clearBtn = document.getElementById("chatClearBtn");
  const input = document.getElementById("chatInput");

  if (sendBtn) sendBtn.addEventListener("click", sendLangGraphMessage);
  if (clearBtn) clearBtn.addEventListener("click", clearChatHistory);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendLangGraphMessage();
    }
  });
});

// ✅ 함수 전역 등록 (HTML에서 직접 호출 가능하도록)
window.sendLangGraphMessage = sendLangGraphMessage;
window.clearChatHistory = clearChatHistory;
