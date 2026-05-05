'use strict';

function log(msg) {
  console.log("[LGTM] " + msg);
}

function getPRInfo() {
  const match = location.pathname.match(/^\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2], number: parseInt(match[3]) };
}

function isContextValid() {
  try { return !!chrome.runtime?.id; } catch (_) { return false; }
}

// --- Shared utilities ---

function waitForElement(selector, root, timeoutMs) {
  return new Promise((resolve, reject) => {
    const existing = root.querySelector(selector);
    if (existing) { resolve(existing); return; }

    const obs = new MutationObserver(() => {
      if (!isContextValid()) { obs.disconnect(); reject(new Error("Context invalidated")); return; }
      const el = root.querySelector(selector);
      if (el) { obs.disconnect(); resolve(el); }
    });
    obs.observe(root, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); reject(new Error("Timeout waiting for: " + selector)); }, timeoutMs);
  });
}

function findByText(selector, text, root) {
  root = root || document;
  const candidates = Array.from(root.querySelectorAll(selector));
  return candidates.find(el => el.textContent.trim().toLowerCase().includes(text.toLowerCase())) || null;
}

// --- New (React-based) UI ---

async function fillAndOpenReview(reviewText) {
  const reviewBtn = document.querySelector('[class*="ReviewMenuButton-module__ReviewMenuButton"]');
  if (!reviewBtn) throw new Error("Review button not found.");

  reviewBtn.click();

  let dialog = null;
  try {
    dialog = await waitForElement('[role="dialog"], dialog', document.body, 3000);
    log("Dialog found: " + (dialog.getAttribute('role') || dialog.tagName));
  } catch (_) {
    log("No dialog, looking for menu...");
    const menu = await waitForElement('[role="menu"], [role="listbox"]', document.body, 3000);
    log("Menu found");

    const approveItem = findByText('[role="menuitem"], [role="option"], button, a', 'approve', menu);
    if (!approveItem) throw new Error("Cannot find Approve option in menu.");
    approveItem.click();
    log("Clicked Approve menu item");

    try {
      dialog = await waitForElement('[role="dialog"], dialog', document.body, 3000);
      log("Follow-up dialog found");
    } catch (_) {
      log("No follow-up dialog after menu click — may have submitted directly.");
      return;
    }
  }

  const textarea = document.querySelector('textarea[placeholder="Leave a comment"]')
    || document.querySelector('textarea[aria-label="Markdown value"]')
    || dialog.querySelector('textarea');

  if (textarea) {
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    nativeSetter.call(textarea, reviewText);
    textarea.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    log("Filled textarea");
  } else {
    log("No textarea found");
  }

  const approveRadio = document.querySelector('input[type="radio"][value="approve"][name="reviewEvent"]')
    || document.querySelector('input[type="radio"][value="approve"]');

  if (approveRadio) {
    approveRadio.click();
    log("Selected Approve radio");
  } else {
    log("WARNING: Could not find Approve radio — please select it manually.");
  }

  log("Form ready — review is pre-filled, click Submit review to confirm.");
}

async function lgtmNew() {
  if (!getPRInfo()) return;

  let data;
  try {
    data = await chrome.storage.sync.get("lgtm_comment");
  } catch (e) {
    alert("LGTM: Please reload the page to reconnect the extension.");
    return;
  }
  const comment = typeof data.lgtm_comment === 'string' ? data.lgtm_comment : "LGTM";

  try {
    await fillAndOpenReview(comment);
  } catch (e) {
    log("Error: " + e.message);
    alert("LGTM error: " + e.message + "\n\nCheck the console for details.");
  }
}

function tryInjectNew() {
  if (document.getElementById("lgtm_button")) return;
  if (!getPRInfo()) return;

  const reviewBtn = document.querySelector('[class*="ReviewMenuButton-module__ReviewMenuButton"]');
  if (!reviewBtn) return;

  const lgtmBtn = reviewBtn.cloneNode(true);
  lgtmBtn.id = 'lgtm_button';

  lgtmBtn.className = lgtmBtn.className
    .split(' ')
    .filter(c => c.startsWith('prc-'))
    .join(' ');

  lgtmBtn.querySelector('[data-component="trailingAction"]')?.remove();

  const textEl = lgtmBtn.querySelector('[data-component="text"]');
  if (textEl) textEl.textContent = 'LGTM';

  lgtmBtn.addEventListener('click', lgtmNew);

  reviewBtn.parentNode.insertBefore(lgtmBtn, reviewBtn);
  log("Button injected (new UI)");
}

// --- Legacy (server-rendered) UI ---

function openLegacyReviewPanel(reviews_container) {
  // Newer Enterprise: popover-based overlay
  const popoverBtn = reviews_container.querySelector('[popovertarget]');
  if (popoverBtn) {
    const targetId = popoverBtn.getAttribute('popovertarget');
    const panel = document.getElementById(targetId);
    if (panel && !panel.matches(':popover-open')) {
      popoverBtn.click();
    }
    return;
  }
  // Older Enterprise: <details> toggle
  const details = reviews_container.getElementsByTagName("details")[0];
  if (details) {
    details.setAttribute('open', '');
  }
}

function initLegacy() {
  const reviews_container = document.getElementsByClassName("js-reviews-container")[0];
  if (!reviews_container) return;

  if (document.getElementById("lgtm_button")) return;
  if (!getPRInfo()) return;

  const textarea = document.getElementById("pull_request_review_body");
  if (!textarea) {
    log("Legacy UI: Cannot find pull request review textarea.");
    return;
  }

  const radio = document.getElementsByName("pull_request_review[event]");
  if (!radio || radio.length === 0) {
    log("Legacy UI: Cannot find pull request review radio buttons.");
    return;
  }
  if (radio[0].type === 'hidden') {
    log("Legacy UI: Closed or Merged PR.");
    return;
  }

  let disabled = false;
  radio.forEach(function (v) {
    if (v.disabled) disabled = true;
  });
  if (disabled) {
    log("Legacy UI: Radio buttons disabled (own PR).");
    return;
  }

  reviews_container.insertAdjacentHTML(
    "beforebegin",
    '<div class="diffbar-item mr-2">' +
      '<button id="lgtm_button" class="btn btn-sm btn-primary" type="button">LGTM</button>' +
    '</div>'
  );
  log("Button injected (legacy UI)");

  const lgtm_button = document.getElementById("lgtm_button");

  lgtm_button.addEventListener("click", function () {
    chrome.storage.sync.get("lgtm_comment", function (data) {
      let review_text = data.lgtm_comment;
      if (typeof review_text !== "string") {
        review_text = "";
      }

      const storage_key = "session-resume:" + location.pathname;
      const storage_value = sessionStorage.getItem(storage_key);
      const editing = !!(storage_value || !(textarea.value === review_text || textarea.value === ""));

      if (!editing) {
        textarea.value = review_text;
        radio.forEach(function (v) {
          if (!v.disabled && v.value === "approve") {
            v.checked = true;
          }
        });
        openLegacyReviewPanel(reviews_container);
        log("RESULT : Applied!");
      } else {
        log("RESULT : Not applied (editing)");
      }
    });
  }, false);
}

// --- Detection & bootstrap ---

let debounceTimer = null;
let uiDetected = false;

function resetDetection() {
  uiDetected = false;
  scheduleDetect();
}

function detectAndInit() {
  if (uiDetected) return;
  if (!getPRInfo()) return;

  if (document.querySelector('[class*="ReviewMenuButton-module__ReviewMenuButton"]')) {
    uiDetected = true;
    log("Detected: new React UI");
    tryInjectNew();
    return;
  }

  if (document.getElementsByClassName("js-reviews-container").length > 0) {
    uiDetected = true;
    log("Detected: legacy UI");
    initLegacy();
    return;
  }
}

function scheduleDetect() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(detectAndInit, 300);
}

document.addEventListener("pjax:end", resetDetection);
document.addEventListener("turbo:render", resetDetection);
document.addEventListener("popstate", resetDetection);

const observer = new MutationObserver(() => {
  if (!isContextValid()) { observer.disconnect(); return; }
  if (uiDetected) {
    if (document.querySelector('[class*="ReviewMenuButton-module__ReviewMenuButton"]')) {
      tryInjectNew();
    }
  } else {
    scheduleDetect();
  }
});
observer.observe(document.documentElement, { childList: true, subtree: true });
scheduleDetect();
