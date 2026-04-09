const dot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const bridgeUrlEl = document.getElementById("bridgeUrl");
const hint = document.getElementById("hint");
const reconnectBtn = document.getElementById("reconnectBtn");
const diagBtn = document.getElementById("diagBtn");

function setStatus(connected, bridgeUrl) {
  dot.className = "dot " + (connected ? "connected" : "disconnected");
  statusText.textContent = connected ? "Connected ✓" : "Disconnected";
  bridgeUrlEl.textContent = bridgeUrl || "ws://localhost:3002";

  if (connected) {
    hint.innerHTML = "Atlas can see your browser. Start a job search in the app.";
    reconnectBtn.textContent = "Reconnect";
  } else {
    hint.innerHTML =
      "Bridge not reachable. Make sure <code style='color:#06b6d4'>npm run browser-server</code> is running in your project terminal, then click Reconnect.";
    reconnectBtn.textContent = "Reconnect";
  }
}

function checkStatus() {
  dot.className = "dot checking";
  statusText.textContent = "Checking…";

  chrome.runtime.sendMessage({ type: "get_status" }, (resp) => {
    if (chrome.runtime.lastError || !resp) {
      // Service worker may be suspended — show disconnected
      setStatus(false, "ws://localhost:3002");
      hint.innerHTML =
        "Service worker is suspended. Click <strong>Reconnect</strong> to wake it, then check again.";
      return;
    }
    setStatus(resp.connected, resp.bridgeUrl);
  });
}

reconnectBtn.addEventListener("click", () => {
  reconnectBtn.disabled = true;
  reconnectBtn.textContent = "Reconnecting…";
  chrome.runtime.sendMessage({ type: "reconnect" }, () => {
    // Give the WS handshake a moment then re-check
    setTimeout(() => {
      reconnectBtn.disabled = false;
      checkStatus();
    }, 1500);
  });
});

diagBtn.addEventListener("click", () => {
  // Opens the Extensions management page — user can click "service worker" from there
  chrome.tabs.create({ url: "edge://extensions/" }).catch(() => {
    chrome.tabs.create({ url: "chrome://extensions/" });
  });
});

// Check on open
checkStatus();
