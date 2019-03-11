function log(msg) {
  console.log("[LGTM] " + msg);
}

function lgtm(event) {

  try {
    // Find containers
    let reviews_container = document.getElementsByClassName("js-reviews-container")[0];
    if (!reviews_container) {
      throw "Cannot find `js-reviews-container`.";
    }
    let review_details = reviews_container.getElementsByTagName("details")[0];
    if (!review_details) {
      throw "Cannot find `details`.";
    }

    let lgtm_button = document.getElementById("lgtm_button");
    if (!lgtm_button) {
      // Insert button
      reviews_container.insertAdjacentHTML(
          "beforebegin",
          '<div class="diffbar-item">' +
            '<button id="lgtm_button" class="btn btn-sm btn-primary" type="button">LGTM</button>' +
          '</div>'
          );
      log("LGTM button inserted");
      lgtm_button = document.getElementById("lgtm_button");
    }

    // Find review comment textarea and radio
    let textarea = document.getElementById("pull_request_review_body");
    if (!textarea) {
      throw "Cannot find pull request review textarea.";
    }

    let radio = document.getElementsByName("pull_request_review[event]");
    if (!radio) {
      throw "Cannot find pull request review radio buttons.";
    } else if (radio[0].type === 'hidden') {
      throw "Closed or Merged PR.";
    } else {
      radio.forEach(function (v) {
        if (v.disabled) {
          throw "One or more radio buttons are disabled. Probably you are looking at your own PR.";
        }
      });
    }

    // Add event listener
    lgtm_button.addEventListener("click", function () {
          log('CHROME STORAGE : ' + chrome.storage);
          chrome.storage.sync.get("lgtm_comment", function (data) {
            let review_text = data.lgtm_comment;
            if (typeof review_text !== "string") {
              review_text = "";
            }

            // Lookup sessionStorage to check if it had been being edited
            let storage_key = "session-resume:" + location.pathname;
            let storage_value = sessionStorage.getItem(storage_key);
            let editing = !!(storage_value || !(textarea.value === review_text || textarea.value === ""));

            //log("storage value '" + storage_key + "' : " + storage_value);
            //log("review_text : '" + review_text + "'");
            //log("textarea.value : '" + textarea.value + "'");
            //log("editing : " + editing);

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
            review_details.setAttribute('open', '');
          });
        }, false);
  } catch (e) {
    let lgtm_button = document.getElementById("lgtm_button");
    if (lgtm_button) {
      lgtm_button.setAttribute('disabled', '');
    }
    log(e);
    return;
  }
}

if (["complete", "interactive"].includes(document.readyState)) {
  lgtm();
} else {
  document.addEventListener("DOMContentLoaded", lgtm);
}

document.addEventListener("pjax:end", lgtm);
document.addEventListener("popstate", lgtm);
