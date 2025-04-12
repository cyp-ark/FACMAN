async function sendMessage() {
  const textarea = document.querySelector(".chatbot textarea");
  const message = textarea.value.trim();
  if (!message) return;

  const responseBox = document.querySelector(".chat-response");
  responseBox.textContent = "⏳ 응답을 생성 중입니다...";

  try {
    const res = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });

    const data = await res.json();
    responseBox.textContent = data.reply;
  } catch (err) {
    responseBox.textContent = "❌ 서버와의 연결에 실패했습니다.";
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const button = document.querySelector(".chatbot button");
  if (button) {
    button.addEventListener("click", sendMessage);
  }
});