// Remembers which file input you last clicked, so "Attach" goes to the right field.
(function () {
  const remember = (e) => {
    const t = e.target;
    if (t && t.tagName === "INPUT" && t.type === "file") window.__applyKitLast = t;
  };
  document.addEventListener("click", remember, true);
  document.addEventListener("focusin", remember, true);
})();
