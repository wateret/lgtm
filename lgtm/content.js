function log(msg) {
  console.log("[LGTM] " + msg);
}

function lgtm(event) {
  log("BEGIN");

  try {
    // Find review comment textarea and radio
    var textarea = document.getElementById("pull_request_review_body");
    if (!textarea) {
      throw "Cannot find pull request review textarea.";
    }

    var radio = document.getElementsByName("pull_request_review[event]");
    if (!radio) {
      throw "Cannot find pull request review radio buttons.";
    } else {
      radio.forEach(function (v) {
        if (v.disabled) {
          throw "One or more radio buttons are disabled. Probably you are looking at your own PR.";
        }
      });
    }
  } catch (e) {
    log(e);
    return;
  }

  chrome.storage.sync.get("lgtm_comment", function (data) {
    let review_text = data.lgtm_comment;
    if (typeof review_text !== "string") {
      review_text = "";
    }

    // Lookup sessionStorage to check if it had been being edited
    let storage_key = "session-resume:" + location.pathname;
    let editing = !!(sessionStorage.getItem(storage_key) || textarea.value !== "");

    log("storage value '" + storage_key + "' : " + sessionStorage.getItem(storage_key));
    log("textarea.value : '" + textarea.value + "'");
    log("editing : " + editing);

    // Set default review comment and set approve radio button
    if (!editing) {
      textarea.value = review_text;
      radio.forEach(function (v) {
        if (!v.disabled && v.value === "approve") {
          v.checked = true;
        }
      });
      log("RESULT : Applied!");
    } else {
      log("RESULT : Not applied (editing)");
    }
  });
}

if (["complete", "interactive"].includes(document.readyState)) {
  lgtm();
} else {
  document.addEventListener("DOMContentLoaded", lgtm);
}

document.addEventListener("pjax:end", lgtm);
