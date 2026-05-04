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

// Wait for an element matching selector to appear inside root, up to timeoutMs.
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

// Find an element by text content among elements matching selector.
function findByText(selector, text, root) {
  root = root || document;
  const candidates = Array.from(root.querySelectorAll(selector));
  return candidates.find(el => el.textContent.trim().toLowerCase().includes(text.toLowerCase())) || null;
}

async function fillAndOpenReview(reviewText) {
  const reviewBtn = document.querySelector('[class*="ReviewMenuButton-module__ReviewMenuButton"]');
  if (!reviewBtn) throw new Error("Review button not found.");

  // Click to open the review dialog / menu
  reviewBtn.click();

  // GitHub may render a dialog (<dialog> or role=dialog) or an action menu (role=menu)
  let dialog = null;
  try {
    dialog = await waitForElement('[role="dialog"], dialog', document.body, 3000);
    log("Dialog found: " + (dialog.getAttribute('role') || dialog.tagName));
  } catch (_) {
    // No dialog — maybe it's an action menu (dropdown)
    log("No dialog, looking for menu...");
    const menu = await waitForElement('[role="menu"], [role="listbox"]', document.body, 3000);
    log("Menu found");

    // Look for an Approve item in the menu
    const approveItem = findByText('[role="menuitem"], [role="option"], button, a', 'approve', menu);
    if (!approveItem) throw new Error("Cannot find Approve option in menu.");
    approveItem.click();
    log("Clicked Approve menu item");

    // After clicking Approve, a form/dialog may follow
    try {
      dialog = await waitForElement('[role="dialog"], dialog', document.body, 3000);
      log("Follow-up dialog found");
    } catch (_) {
      log("No follow-up dialog after menu click — may have submitted directly.");
      return;
    }
  }

  // Fill in textarea — search document-wide since the form renders in a portal.
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

  // Select the Approve radio button — search document-wide since the dialog
  // may render into a portal outside the dialog element itself.
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

async function lgtm() {
  if (!getPRInfo()) return;

  let data;
  try {
    data = await chrome.storage.sync.get("lgtm_comment");
  } catch (e) {
    // Extension was reloaded while the tab was open — context is stale.
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

// --- Button injection ---

let debounceTimer = null;

function tryInject() {
  if (document.getElementById("lgtm_button")) return;
  if (!getPRInfo()) return;

  const reviewBtn = document.querySelector('[class*="ReviewMenuButton-module__ReviewMenuButton"]');
  if (!reviewBtn) return;

  const lgtmBtn = reviewBtn.cloneNode(true);
  lgtmBtn.id = 'lgtm_button';

  // Keep only prc-* classes (visual) — strips the module class GitHub hooks behavior onto
  lgtmBtn.className = lgtmBtn.className
    .split(' ')
    .filter(c => c.startsWith('prc-'))
    .join(' ');

  // Remove the dropdown arrow
  lgtmBtn.querySelector('[data-component="trailingAction"]')?.remove();

  // Set button text
  const textEl = lgtmBtn.querySelector('[data-component="text"]');
  if (textEl) textEl.textContent = 'LGTM';

  lgtmBtn.addEventListener('click', lgtm);

  reviewBtn.parentNode.insertBefore(lgtmBtn, reviewBtn);
  log("Button injected");
}

function scheduleInject() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(tryInject, 300);
}

const observer = new MutationObserver(() => {
  if (!isContextValid()) { observer.disconnect(); return; }
  scheduleInject();
});
observer.observe(document.documentElement, { childList: true, subtree: true });
scheduleInject();
