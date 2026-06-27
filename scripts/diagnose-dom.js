// Relay DOM Diagnostic Script
// Paste this in Chrome DevTools console on ChatGPT/Gemini/Grok

(function() {
  const site = window.location.hostname;
  console.log("=== Relay Diagnostic ===");
  console.log("Site:", site);
  
  // Find all potential inputs
  const inputSelectors = ["rich-textarea", "textarea", '[contenteditable="true"]', '[role="textbox"]', "div.ProseMirror", '[class*="ProseMirror"]'];
  console.log("\n--- Inputs ---");
  for (const sel of inputSelectors) {
    const els = document.querySelectorAll(sel);
    if (els.length > 0) {
      els.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        console.log(`${sel}[${i}]:`, {
          tag: el.tagName,
          id: el.id,
          class: el.className?.substring?.(0, 80) || '',
          visible: r.width > 0 && r.height > 0,
          size: `${Math.round(r.width)}x${Math.round(r.height)}`
        });
      });
    }
  }
  
  // Find all buttons
  console.log("\n--- Buttons ---");
  const buttons = document.querySelectorAll('button');
  buttons.forEach((btn, i) => {
    const r = btn.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      console.log(`button[${i}]:`, {
        testid: btn.dataset?.testid,
        aria: btn.getAttribute('aria-label'),
        class: btn.className?.substring?.(0, 60) || '',
        text: btn.textContent?.trim()?.substring(0, 30),
        size: `${Math.round(r.width)}x${Math.round(r.height)}`,
        pos: `${Math.round(r.left)},${Math.round(r.top)}`
      });
    }
  });
  
  // Find forms and their structure
  console.log("\n--- Forms ---");
  const forms = document.querySelectorAll('form');
  forms.forEach((form, i) => {
    const buttons = form.querySelectorAll('button');
    console.log(`form[${i}]:`, {
      class: form.className?.substring?.(0, 60) || '',
      buttons: buttons.length,
      html: form.innerHTML?.substring(0, 200)
    });
  });
  
  // Look for specific ChatGPT elements
  console.log("\n--- ChatGPT Specific ---");
  const composerActions = document.querySelector('[data-testid="composer-footer-actions"]');
  if (composerActions) {
    console.log("composer-footer-actions:", composerActions.innerHTML?.substring(0, 300));
  }
  
  const sendBtn = document.querySelector('[data-testid="send-button"]');
  if (sendBtn) {
    console.log("send-button:", sendBtn.outerHTML?.substring(0, 200));
    console.log("send-button parent:", sendBtn.parentElement?.tagName, sendBtn.parentElement?.className?.substring(0, 50));
  }
  
  console.log("\n=== End Diagnostic ===");
})();
