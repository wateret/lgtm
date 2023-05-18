chrome.runtime.onInstalled.addListener(function(details) {
  if (details.reason == "install") {
    // Set the default comment
    chrome.storage.sync.set({lgtm_comment: "LGTM", reviewers: "username1;username2;..."}, function () {});
  }
});
