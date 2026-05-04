'use strict';

let ta_comment = document.getElementById("ta_comment");
let btn_save = document.getElementById("btn_save");
let btn_discard = document.getElementById("btn_discard");

chrome.storage.sync.get("lgtm_comment", function(data) {
  ta_comment.value = data.lgtm_comment || "";
});

btn_save.onclick = function() {
  chrome.storage.sync.set({lgtm_comment: ta_comment.value}, function() {
    window.close();
  });
};

btn_discard.onclick = function() {
  window.close();
};
