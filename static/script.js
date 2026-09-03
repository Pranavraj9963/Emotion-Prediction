(() => {
  "use strict";

  const EMOTIONS = ["sadness", "joy", "love", "anger", "fear", "surprise"];
  const EMOJI = {
    sadness: "😢",
    joy: "😄",
    love: "❤️",
    anger: "😠",
    fear: "😨",
    surprise: "😲",
  };

  const body = document.body;
  const statusEl = document.getElementById("status");
  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");

  const form = document.getElementById("predictForm");
  const textInput = document.getElementById("textInput");
  const charCount = document.getElementById("charCount");
  const submitBtn = document.getElementById("submitBtn");
  const submitLabel = document.getElementById("submitLabel");
  const errorMsg = document.getElementById("errorMsg");

  const blobEmoji = document.getElementById("blobEmoji");
  const readingLabel = document.getElementById("readingLabel");

  const breakdown = document.getElementById("breakdown");
  const barsList = document.getElementById("barsList");

  let modelReady = false;
  let healthTimer = null;

  // ---------- health check ----------

  async function checkHealth() {
    try {
      const res = await fetch("/health");
      if (!res.ok) throw new Error("bad status");
      const data = await res.json();
      modelReady = !!data.model_loaded;
    } catch (_err) {
      modelReady = false;
    }
    renderHealth();
  }

  function renderHealth() {
    if (modelReady) {
      statusEl.dataset.ready = "true";
      statusText.textContent = "Model ready";
      submitBtn.disabled = textInput.value.trim().length === 0;
      submitLabel.textContent = "Read it";
      if (healthTimer) {
        clearInterval(healthTimer);
        healthTimer = null;
      }
    } else {
      statusEl.dataset.ready = "false";
      statusText.textContent = "Waking up";
      submitBtn.disabled = true;
      submitLabel.textContent = "Waking up the model\u2026";
    }
  }

  checkHealth();
  healthTimer = setInterval(checkHealth, 3000);

  // ---------- textarea ----------

  textInput.addEventListener("input", () => {
    const len = textInput.value.length;
    charCount.textContent = `${len} / 2000`;
    if (modelReady) {
      submitBtn.disabled = textInput.value.trim().length === 0;
    }
  });

  textInput.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  // ---------- submit ----------

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = textInput.value.trim();
    if (!text || !modelReady) return;

    hideError();
    enterThinking();

    try {
      const res = await fetch("/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (res.status === 503) {
        modelReady = false;
        renderHealth();
        healthTimer = healthTimer || setInterval(checkHealth, 3000);
        throw new Error("The model's still waking up. Try again in a moment.");
      }
      if (!res.ok) {
        const detail = await safeDetail(res);
        throw new Error(detail || "That sentence didn't go through. Try again.");
      }

      const data = await res.json();
      renderResult(data);
    } catch (err) {
      showError(err.message || "Something went wrong. Try again.");
      exitThinking();
    }
  });

  async function safeDetail(res) {
    try {
      const j = await res.json();
      return j.detail;
    } catch (_e) {
      return null;
    }
  }

  // ---------- state transitions ----------

  function enterThinking() {
    body.dataset.state = "thinking";
    readingLabel.textContent = "Reading it\u2026";
    submitBtn.disabled = true;
    submitLabel.textContent = "Reading\u2026";
  }

  function exitThinking() {
    body.dataset.state = "idle";
    readingLabel.textContent = "Waiting for a sentence";
    submitBtn.disabled = textInput.value.trim().length === 0;
    submitLabel.textContent = "Read it";
  }

  function renderResult(data) {
    const { predicted_emotion, confidence, all_probabilities } = data;

    body.dataset.emotion = predicted_emotion;
    body.dataset.state = "result";
    blobEmoji.textContent = EMOJI[predicted_emotion] || "\uff3f";

    const pct = Math.round(confidence * 100);
    readingLabel.innerHTML =
      `This reads as <span class="name">${cap(predicted_emotion)}</span> ` +
      `<span class="pct">&middot; ${pct}%</span>`;

    renderBars(all_probabilities, predicted_emotion);

    submitBtn.disabled = false;
    submitLabel.textContent = "Read another";
  }

  function renderBars(probs, topEmotion) {
    barsList.innerHTML = "";
    const ordered = EMOTIONS.slice().sort((a, b) => (probs[b] || 0) - (probs[a] || 0));

    ordered.forEach((emotion, i) => {
      const value = probs[emotion] || 0;
      const pct = Math.round(value * 100);

      const li = document.createElement("li");
      li.className = "bar-row" + (emotion === topEmotion ? " top" : "");

      li.innerHTML = `
        <span class="bar-label"><span class="em">${EMOJI[emotion]}</span>${cap(emotion)}</span>
        <span class="bar-track"><span class="bar-fill" style="--fill: var(--accent)"></span></span>
        <span class="bar-pct">${pct}%</span>
      `;

      barsList.appendChild(li);

      const fill = li.querySelector(".bar-fill");
      // stagger the reveal slightly per row
      setTimeout(() => {
        fill.style.width = `${pct}%`;
      }, 40 + i * 70);
    });

    breakdown.hidden = false;
  }

  function cap(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function showError(message) {
    errorMsg.textContent = message;
    errorMsg.hidden = false;
  }

  function hideError() {
    errorMsg.hidden = true;
    errorMsg.textContent = "";
  }
})();