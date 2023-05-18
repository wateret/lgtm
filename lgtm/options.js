'use strict';

let ta_comment = document.getElementById("ta_comment");
let ta_reviewers = document.getElementById("ta_reviewers");
let btn_save = document.getElementById("btn_save");

chrome.storage.sync.get("lgtm_comment", function(data) {
  ta_comment.value = data.lgtm_comment;
});

chrome.storage.sync.get("reviewers", function(data) {
  ta_reviewers.value = data.reviewers;
});

btn_save.onclick = function(element) {
  chrome.storage.sync.set({lgtm_comment: ta_comment.value, reviewers: ta_reviewers.value}, function() {
    window.close();
  });
};

btn_discard.onclick = function(element) {
  window.close();
};
